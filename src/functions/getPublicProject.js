// Legacy Base44 "@/functions/<name>" import shim.
// The Base44 vite plugin used to generate these; locally we forward to the
// backend function and return an axios-style { data } envelope, matching how
// callers read `res.data`.
import { base44 } from '@/api/base44Client';

export async function getPublicProject(params) {
  const data = await base44.functions.invoke('getPublicProject', params);
  return { data };
}

export default getPublicProject;
