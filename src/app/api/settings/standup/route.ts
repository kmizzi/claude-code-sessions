import { getMeta, setMeta } from "@/lib/db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface StandupConfig {
  meetingTime: string; // "HH:MM" in 24h format
  timezone: string; // IANA timezone e.g. "America/New_York"
}

const DEFAULT_CONFIG: StandupConfig = {
  meetingTime: "09:30",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

export async function GET(): Promise<Response> {
  const raw = getMeta("standup_config");
  const config: StandupConfig = raw ? JSON.parse(raw) : DEFAULT_CONFIG;
  return Response.json(config);
}

export async function PUT(req: Request): Promise<Response> {
  const body = await req.json();
  const config: StandupConfig = {
    meetingTime: body.meetingTime ?? DEFAULT_CONFIG.meetingTime,
    timezone: body.timezone ?? DEFAULT_CONFIG.timezone,
  };

  // Validate time format
  if (!/^\d{2}:\d{2}$/.test(config.meetingTime)) {
    return Response.json({ error: "meetingTime must be HH:MM" }, { status: 400 });
  }

  setMeta("standup_config", JSON.stringify(config));
  return Response.json(config);
}
