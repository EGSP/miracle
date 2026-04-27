import { useQuery } from "@tanstack/react-query";
import { user } from "../generated";

export function useGetUser(id:string|undefined) {
    return useQuery({
        queryKey: ['user', id],
        queryFn: () => user.getUser({ id: id! }),
        enabled: !!id,
    });
};