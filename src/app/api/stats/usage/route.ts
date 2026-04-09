import { getTokenUsageByPeriod } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const periods = getTokenUsageByPeriod();
  return Response.json({ periods });
}
