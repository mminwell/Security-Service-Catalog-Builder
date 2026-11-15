import { runAuthAttempt } from "@/lib/auth/attempt-gate";

export async function POST(request: Request) {
  return runAuthAttempt(request, "sign_in");
}
