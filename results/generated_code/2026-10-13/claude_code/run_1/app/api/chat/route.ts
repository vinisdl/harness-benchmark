import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  stepCountIs,
} from 'ai';
import { randomUUID } from 'node:crypto';
import { chatModel, SYSTEM_PROMPT } from '@/lib/provider';
import { getConfig } from '@/lib/config';
import { getStore, type TurnLease } from '@/lib/db/store';
import { outgoingMessages, usageTokens } from '@/lib/history';
import { generateTitle } from '@/lib/title';
import { chatTools, selectTool } from '@/lib/tools';
import { AppError, PROVIDER_ERROR, errorResponse } from '@/lib/errors';
import { parseChatRequest } from '@/lib/request';
import type { ChatMessage } from '@/lib/chat-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  let turn: TurnLease | undefined;
  try {
    const input = await parseChatRequest(request);
    const model = chatModel(); // Missing-key preflight before acquiring a turn or calling the provider.
    const config = getConfig();
    const store = getStore();
    turn = store.acquire(input.conversationId, input.message.id);
    const activeTurn = turn;
    const user = {
      id: input.message.id,
      role: 'user' as const,
      content: input.message.text,
    };
    const assistantId = randomUUID();
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(config.timeoutMs),
    ]);
    const stream = createUIMessageStream<ChatMessage>({
      onError: () => PROVIDER_ERROR,
      execute: async ({ writer }) => {
        let committed = false;
        let chargedTokens = 0;
        let answer = '';
        let failed = false;
        try {
          const forcedTool = selectTool(user.content);
          const result = streamText({
            model,
            system: SYSTEM_PROMPT,
            messages: outgoingMessages(activeTurn.history, user.content),
            tools: chatTools,
            stopWhen: stepCountIs(5),
            prepareStep: ({ stepNumber }) => ({
              toolChoice:
                stepNumber === 0 && forcedTool
                  ? { type: 'tool', toolName: forcedTool }
                  : 'auto',
            }),
            maxOutputTokens: 2048,
            maxRetries: 0,
            abortSignal: signal,
            onError: () => {
              failed = true;
            },
          });
          const uiStream = toUIMessageStream<typeof chatTools, ChatMessage>({
            stream: result.stream,
            tools: chatTools,
            generateMessageId: () => assistantId,
            sendReasoning: false,
            sendFinish: false,
            onError: () => PROVIDER_ERROR,
          });
          // Forward each SDK chunk immediately. Only persistence waits for completion.
          for await (const chunk of uiStream) {
            if (chunk.type === 'text-delta') answer += chunk.delta;
            if (chunk.type === 'error' || chunk.type === 'abort') failed = true;
            if (
              Buffer.byteLength(answer, 'utf8') >
              Math.min(
                16000,
                config.maxBytes -
                  Buffer.byteLength(user.content, 'utf8') -
                  1000,
              )
            ) {
              throw new AppError(
                'response_too_large',
                'This answer exceeded the history size limit and was not saved. Please ask for a shorter response.',
                413,
              );
            }
            writer.write(chunk);
          }
          chargedTokens = usageTokens(
            await result.usage,
            user.content + answer,
          );
          const finishReason = await result.finishReason;
          if (
            failed ||
            signal.aborted ||
            !answer.trim() ||
            !['stop', 'length'].includes(finishReason)
          )
            throw new Error('Incomplete generation');
          let snapshot = store.commit(
            activeTurn,
            user,
            { id: assistantId, role: 'assistant', content: answer },
            chargedTokens,
          );
          committed = true;
          if (activeTurn.firstExchange) {
            try {
              const title = await generateTitle(
                model,
                user.content,
                answer,
                signal,
              );
              snapshot = store.setTitle(activeTurn, title.title, title.tokens);
            } catch {
              writer.write({
                type: 'data-warning',
                data: {
                  message:
                    'Your conversation was saved, but its title could not be generated.',
                },
                transient: true,
              });
            }
          }
          writer.write({
            type: 'data-conversation',
            data: {
              title: snapshot.title,
              tokens: snapshot.tokens,
              budget: snapshot.budget,
            },
            transient: true,
          });
          writer.setOutcome({ status: 'completed' });
          writer.write({ type: 'finish', finishReason });
        } catch (error) {
          writer.setOutcome({ status: signal.aborted ? 'aborted' : 'failed' });
          writer.write({
            type: 'error',
            errorText:
              error instanceof AppError ? error.message : PROVIDER_ERROR,
          });
        } finally {
          try {
            // Failed turns consume resources, but their content never becomes replayable history.
            store.release(
              activeTurn,
              committed
                ? 0
                : chargedTokens ||
                    usageTokens(undefined, user.content + answer),
            );
          } catch {
            writer.write({
              type: 'data-warning',
              data: {
                message:
                  'Storage cleanup was delayed. Please wait a moment before sending another turn.',
              },
              transient: true,
            });
          }
        }
      },
    });
    return createUIMessageStreamResponse({
      stream,
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    if (turn) {
      try {
        getStore().release(turn);
      } catch {
        /* The bounded lease expires automatically. */
      }
    }
    return errorResponse(error);
  }
}
