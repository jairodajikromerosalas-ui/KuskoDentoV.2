import { apiError, apiOk } from '@/lib/api-response';
import { getRequestContext } from '@/lib/request-context';
import { fetchDniData, fetchRucData } from './api';

export async function GET(request: Request) {
  try {
    const { clinicId } = await getRequestContext();
    if (!clinicId) return apiError('No autorizado', 401);

    const { searchParams } = new URL(request.url);
    const dni = searchParams.get('dni');
    const ruc = searchParams.get('ruc');

    if (dni) {
      const data = await fetchDniData(dni);
      return apiOk(data);
    }

    if (ruc) {
      const data = await fetchRucData(ruc);
      return apiOk(data);
    }

    return apiError('Debe enviar el parámetro dni o ruc', 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al consultar RENIEC';
    return apiError(message, 500);
  }
}
