"""LiteLLM custom callback: fix params for gpt-6.1-sol (o-series reasoning model).

gpt-6.1-sol requires:
  - max_completion_tokens instead of max_tokens
  - reasoning_effort='none' when function tools are used
    (Azure rejects any non-none reasoning_effort + tools in /v1/chat/completions)

LiteLLM routes gpt-6.1-sol through AzureOpenAIConfig (not the o-series config),
which does not include reasoning_effort in its supported params — so setting it
directly gets dropped by get_optional_params. The fix is to pass it via extra_body,
which the openai SDK merges verbatim into the JSON request body.

Azure always applies a default reasoning_effort to gpt-6.1-sol. Sending
reasoning_effort='none' explicitly disables it and allows function tools.
"""
import logging
from litellm.integrations.custom_logger import CustomLogger

_log = logging.getLogger("token_fixer")


class MaxTokenTranslator(CustomLogger):
    async def async_pre_call_hook(self, user_api_key_dict, cache, data, call_type):
        if call_type in ("completion", "acompletion"):
            if "max_tokens" in data:
                data["max_completion_tokens"] = data.pop("max_tokens")

            if "tools" in data or "functions" in data:
                # Pass via extra_body so it survives AzureOpenAIConfig.map_openai_params
                data.setdefault("extra_body", {})
                data["extra_body"]["reasoning_effort"] = "none"

        return data


proxy_handler_instance = MaxTokenTranslator()
