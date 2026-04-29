import { useGetCookieSession } from "@/lib/queries/sessions.query";
import { useGetUser } from "@/lib/queries/user.query";

export default function CookieSessionInfo() {
    const {data: cookieSession, isLoading: isCookieSessionLoading, isError: isCookieSessionError, error: cookieSessionError} = useGetCookieSession();
    const {data: user, isLoading: isUserLoading, isError: isUserError, error: userError} = useGetUser(cookieSession?.userId);
    if (isCookieSessionLoading) {
        return <div>Loading cookie session...</div>;
    }
    if (isCookieSessionError) {
        return <div>Error loading cookie session: {cookieSessionError.message}</div>;
    }
    if (isUserLoading) {
        return <div> Loading user data...</div>;
    }
    if (isUserError) {
        return <div>Error loading user data: {userError.message}</div>;
    }


    return (
        <div className="flex flex-col gap-2 w-full h-fit">
            <span>Session ID: {cookieSession?.userId || 'N/A'}</span>
            <span>User ID: {cookieSession?.userId || 'N/A'}</span>
        </div>
    )

}