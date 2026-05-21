import axios from 'axios';

const API_TOKEN = process.env.RENIEC_API_TOKEN;
const BASE_URL = 'https://apiperu.dev/api';

export interface ReniecDniData {
  nombres?: string;
  nombre?: string;
  nombre_completo?: string;
  apellido_paterno?: string;
  apellido_materno?: string;
  [key: string]: unknown;
}

export interface ReniecRucData {
  nombre_o_razon_social?: string;
  [key: string]: unknown;
}

const fetchData = async <T>(endpoint: string): Promise<T> => {
  if (!API_TOKEN) {
    throw new Error('RENIEC_API_TOKEN no está configurado en las variables de entorno.');
  }

  const apiUrl = `${BASE_URL}${endpoint}?api_token=${API_TOKEN}`;
  const response = await axios.get<{ success: boolean; data: T }>(apiUrl);

  if (response.data.success) {
    return response.data.data;
  }

  throw new Error('No se encontraron registros.');
};

export const fetchDniData = (dni: string): Promise<ReniecDniData> => {
  return fetchData<ReniecDniData>(`/dni/${dni}`);
};

export const fetchRucData = (ruc: string): Promise<ReniecRucData> => {
  return fetchData<ReniecRucData>(`/ruc/${ruc}`);
};
