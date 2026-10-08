export function serviceEmailSessionChanged(event: string, previous: string, next: string | undefined) {
  if (!previous || event === "INITIAL_SESSION") return false;
  return event === "SIGNED_OUT" || Boolean(next && next !== previous);
}

export function serviceEmailDeliveryView(value: { state?: string; canRetry?: boolean } | null | undefined) {
  const state = value?.state || "unavailable";
  const messages: Record<string, string> = {
    queued: "Review email queued.", retry: "Email was not accepted. Retry is queued.", leased: "Review email is being prepared.",
    dispatching: "Email dispatch is in progress; acceptance is not yet confirmed.", accepted: "Accepted by the email provider; inbox delivery is not confirmed.",
    failed: "Review email was not accepted. Review delivery status before retrying.", unknown: "Email acceptance is unknown. An administrator must review it before another email is sent.",
    suppressed: "Review email was not sent because the request or its owner changed."
  };
  return { emailDeliveryStatus: state, emailDeliveryMessage: messages[state] || "Current email delivery status is unavailable.", emailRetryable: value?.canRetry === true };
}
