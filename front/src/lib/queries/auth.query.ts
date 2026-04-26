import { useMutation } from "@tanstack/react-query";
import api from "../api";

// export const useLogin = (
//     {login, password}: {login: string, password: string}
// ) => {
//     return useMutation({
//         mutationFn: async () => {
//             const response = await api.post('/api/auth/login', {login, password});
//             return response.data;
//         },
//         onSuccess: (data) => {
//             console.log(data);
//         },
//         onError: (error) => {
//             console.error(error);
//         },
//     });
// };