import { describe, it, expect } from "vitest";
import { classifyTopic } from "@/server/ai/guardrails";

describe("assistant topic guardrails", () => {
  it.each([
    ["write a python function to sort a list", "coding"],
    ["can you debug my react component?", "coding"],
    ["explain SQL joins", "coding"],
    ["how do I deploy docker on kubernetes", "coding"],
    ["write code for a calculator", "coding"],
    ["what is the capital of France", "out_of_context"],
    ["tell me a recipe for biryani", "out_of_context"],
    ["who won the 2022 world cup", "out_of_context"],
    ["translate hello to spanish", "out_of_context"],
    ["write a poem about the moon", "out_of_context"],
    ["what is 345 * 12", "out_of_context_calculation"],
    ["calculate 1000 / 7", "out_of_context_calculation"],
    ["solve 25+30*2", "out_of_context_calculation"],
  ])("blocks off-topic: %s", (message, reason) => {
    expect(classifyTopic(message)).toEqual({ decision: "block", reason });
  });

  it.each([
    ["What's my current runway?"],
    ["Add a 10% hike to my salary from month 24"],
    ["Apply 6% inflation to my rent from month 6"],
    ["what if my rent increases 10% and my salary is 80000", ],
    ["how much EMI would a 50 lakh loan at 9% for 20 years be?"],
    ["hi there"],
    ["thanks!"],
    ["who are you"],
    ["what can you do"],
    ["show me my net worth"],
  ])("allows plan-related or small talk: %s", (message) => {
    expect(classifyTopic(message)).toEqual({ decision: "allow" });
  });
});
