import CoockieSessionInfo from "./CoockieSessionInfo"

export function Header() {
  return (
    <div className="flex flex-row w-full h-fit justify-between">
      <span>Miracle</span>
      <CoockieSessionInfo />
    </div>
  )
}
