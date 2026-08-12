import { describe, expect, it } from "vitest";
import {
  groundedSupportAnswer,
  parseSupportAiResponse,
} from "../src/support-ai";

describe("grounded support answers", () => {
  it("answers how to create an event without inventing a required payment", () => {
    const answer = groundedSupportAnswer("Πώς μπορώ να δημιουργήσω ένα event;");
    expect(answer?.escalate).toBe(false);
    expect(answer?.body).toContain("Νέο event");
    expect(answer?.body).toContain("δεν απαιτούν πληρωμή ή κάρτα");
    expect(answer?.body).toContain("7 ημέρες");
    expect(answer?.body).toContain("20");
    expect(answer?.body).not.toMatch(/\bπλήρωσε\b|\bπληρώστε\b|απαιτείται συνδρομή/i);
  });

  it("keeps trial and payment facts consistent in all supported languages", () => {
    const cases = [
      ["How does the free trial and payment work?", "7 days", "20"],
      ["Comment fonctionne l’essai et le paiement ?", "7 jours", "20"],
      ["Wie funktionieren Test und Zahlung?", "7 Tage", "20"],
      ["¿Cómo funcionan la prueba y el pago?", "7 días", "20"],
      ["Come funzionano la prova e il pagamento?", "7 giorni", "20"],
      ["Πώς λειτουργεί το trial και η πληρωμή;", "7 ημέρες", "20"],
    ] as const;

    for (const [question, duration, limit] of cases) {
      const answer = groundedSupportAnswer(question);
      expect(answer?.escalate).toBe(false);
      expect(answer?.body).toContain(duration);
      expect(answer?.body).toContain(limit);
    }
  });

  it("leaves unknown or sensitive questions to the model and escalation policy", () => {
    expect(groundedSupportAnswer("My account may have been compromised.")).toBeNull();
    expect(groundedSupportAnswer("I was charged and want a refund.")).toBeNull();
    expect(groundedSupportAnswer("Χρεώθηκα και θέλω επιστροφή χρημάτων.")).toBeNull();
  });
});

describe("support AI response policy", () => {
  it("accepts explicitly classified answers and escalations", () => {
    expect(parseSupportAiResponse("ANSWER: Open My events and select New event.")).toEqual({
      body: "Open My events and select New event.",
      escalate: false,
    });
    expect(parseSupportAiResponse("ESCALATE: A privacy specialist will review this.")).toEqual({
      body: "A privacy specialist will review this.",
      escalate: true,
    });
  });

  it("fails closed when the model ignores the required response contract", () => {
    expect(parseSupportAiResponse("Here are the steps you should follow.")).toBeNull();
    expect(parseSupportAiResponse("ANSWER:")).toBeNull();
    expect(parseSupportAiResponse("")).toBeNull();
  });

  it("rejects answers that contradict the disabled-payment product state", () => {
    const contradictions = [
      "ANSWER: You must pay before you can create an event.",
      "ANSWER: Payment is required to preview the gallery.",
      "ANSWER: Πρέπει να πληρώσεις πριν δημιουργήσεις event.",
      "ANSWER: Απαιτείται συνδρομή για το preview.",
      "ANSWER: Vous devez payer avant de créer l’événement.",
      "ANSWER: Un paiement est obligatoire avant l’aperçu.",
      "ANSWER: Du musst zahlen, bevor du das Event erstellst.",
      "ANSWER: Eine Zahlung ist erforderlich.",
      "ANSWER: Debes pagar antes de crear el evento.",
      "ANSWER: El pago es obligatorio.",
      "ANSWER: Devi pagare prima di creare l’evento.",
      "ANSWER: Il pagamento è obbligatorio.",
      "ANSWER: Stripe Checkout is now active.",
    ];
    for (const response of contradictions)
      expect(parseSupportAiResponse(response)).toBeNull();
  });

  it("allows accurate statements that payment is not required", () => {
    expect(parseSupportAiResponse(
      "ANSWER: Payment is not required and no card is requested.",
    )).toEqual({
      body: "Payment is not required and no card is requested.",
      escalate: false,
    });
    expect(parseSupportAiResponse(
      "ANSWER: Δεν απαιτείται πληρωμή ή κάρτα.",
    )).toEqual({
      body: "Δεν απαιτείται πληρωμή ή κάρτα.",
      escalate: false,
    });
  });
});
