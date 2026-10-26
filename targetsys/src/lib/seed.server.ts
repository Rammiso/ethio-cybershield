import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getSecurityPosture() {
  const { data } = await supabaseAdmin
    .from("security_posture")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  return (
    data ?? {
      id: 1,
      lab_mode: true,
      lockout_enabled: false,
      lockout_threshold: 5,
      rate_limit_enabled: false,
      rate_limit_per_min: 120,
      new_device_requires_otp: false,
      high_value_threshold_minor: 5000000,
      hold_seconds_for_high_value: 20,
      off_hours_start: "22:00",
      off_hours_end: "06:00",
      show_otp_in_ui: true,
      api_request_telemetry: "ALL",
    }
  );
}
