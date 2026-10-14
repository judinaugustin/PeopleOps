export const requestTransitions: Record<string, string[]> = {
  submitted: ["in_review", "waiting_on_employee", "resolved"],
  in_review: ["waiting_on_employee", "resolved"],
  waiting_on_employee: ["in_review", "resolved"],
  resolved: ["closed", "in_review"],
  closed: [],
};
export function canTransitionRequest(from: string, to: string) {
  return requestTransitions[from]?.includes(to) ?? false;
}
