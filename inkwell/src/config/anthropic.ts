import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { BatchCreateParams, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/messages";

// Created on first use, so a missing ANTHROPIC_API_KEY only fails the calls
// that need it. The key is server-only: never give it a NEXT_PUBLIC_ prefix.
let client: Anthropic | undefined;

function anthropic() {
  client ??= new Anthropic({ timeout: 30_000, maxRetries: 2 });
  return client;
}

export function createMessage(params: MessageCreateParamsNonStreaming) {
  return anthropic().messages.create(params);
}

// Message Batches: half price, results within 24 hours.
export function createBatch(requests: BatchCreateParams["requests"]) {
  return anthropic().messages.batches.create({ requests });
}

export function retrieveBatch(batchId: string) {
  return anthropic().messages.batches.retrieve(batchId);
}

// Results come in any order: match them by custom_id, never by position.
export function batchResults(batchId: string) {
  return anthropic().messages.batches.results(batchId);
}

// A call that failed at the API or on the network, as opposed to a bug.
export function isAnthropicApiError(error: unknown) {
  return error instanceof Anthropic.APIError;
}

// A missing or rejected key: retrying won't help, so it shouldn't count
// against a book.
export function isAnthropicConfigError(error: unknown) {
  return error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError;
}
