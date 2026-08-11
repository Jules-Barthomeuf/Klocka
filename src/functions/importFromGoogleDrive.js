// Legacy Base44 "@/functions/<name>" import shim.
// Google Drive import needs OAuth that isn't available in the local recreation;
// the backend returns an explanatory stub. Returns an axios-style { data }
// envelope to match how callers read `response.data`.
import { base44 } from '@/api/base44Client';

export async function importFromGoogleDrive(params) {
  const data = await base44.functions.invoke('importFromGoogleDrive', params);
  return { data };
}

export default importFromGoogleDrive;
