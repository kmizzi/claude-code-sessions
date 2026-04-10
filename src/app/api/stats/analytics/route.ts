import { getAnalytics } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const analytics = getAnalytics();
  return Response.json({ analytics });
}
