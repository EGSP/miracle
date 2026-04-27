import { useQuery } from "@tanstack/react-query";
import { session } from "../generated";

export function useGetCookieSession() {
    return useQuery({
        queryKey: ['cookie-session'],
        queryFn: () => session.getCookieSession(),
    });
}