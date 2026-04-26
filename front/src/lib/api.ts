import axios, { type AxiosRequestConfig } from "axios";
import { frontConfig } from "./config";

const api = axios.create({
    baseURL: frontConfig.API_URL,
});

export const customInstance = async <T>(config: AxiosRequestConfig): Promise<T> => {
    const response = await api.request<T>(config);
    return response.data;
};

export default api;