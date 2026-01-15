import axios, {
  AxiosError,
  AxiosHeaders,
  AxiosInstance,
  AxiosRequestConfig,
} from "axios";
import { auth } from "./firebase";

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api/v1`
  : "http://localhost:8000/api/v1";

const IS_E2E_TEST_MODE = import.meta.env.VITE_E2E_TEST_MODE === "true";
const E2E_BYPASS_TOKEN =
  import.meta.env.VITE_E2E_BYPASS_TOKEN ?? "e2e-playwright";

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      async (config) => {
        const applyAuthHeader = (value: string) => {
          if (config.headers instanceof AxiosHeaders) {
            config.headers.set("Authorization", value);
            return;
          }
          const headers = AxiosHeaders.from(config.headers ?? {});
          headers.set("Authorization", value);
          config.headers = headers;
        };

        if (IS_E2E_TEST_MODE) {
          applyAuthHeader(`Bearer ${E2E_BYPASS_TOKEN}`);
          return config;
        }

        const user = auth.currentUser;
        if (user) {
          const token = await user.getIdToken();
          applyAuthHeader(`Bearer ${token}`);
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error("🚨 API Error:", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
          url: error.config?.url,
        });

        if (error.response?.status === 401) {
          console.error("🔒 401 Unauthorized - Logging out");
          // Token expired or invalid
          auth.signOut();
          window.location.href = "/login";
        }
        return Promise.reject(error);
      },
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.get<T>(url, config);
    return response.data;
  }

  async post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.put<T>(url, data, config);
    return response.data;
  }

  async patch<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const response = await this.client.patch<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.client.delete<T>(url, config);
    return response.data;
  }
}

export const apiClient = new ApiClient();
