/** A little cooking pot with rising steam and bubbling contents. */
export function CookingLoader() {
  return (
    <div className="flex flex-col items-center py-3">
      <div className="relative h-[92px] w-[130px]">
        {/* steam */}
        <div className="absolute inset-x-0 top-0 flex justify-center gap-3">
          <span className="animate-steam1 h-5 w-[3px] rounded-full bg-accent/60" />
          <span className="animate-steam2 h-6 w-[3px] rounded-full bg-accent/60" />
          <span className="animate-steam3 h-5 w-[3px] rounded-full bg-accent/60" />
        </div>

        {/* pot */}
        <div className="animate-bob absolute bottom-0 left-1/2 -translate-x-1/2">
          <svg width="118" height="66" viewBox="0 0 118 66" fill="none">
            <clipPath id="pot">
              <path d="M12 22h94v20a20 20 0 0 1-20 20H32a20 20 0 0 1-20-20V22z" />
            </clipPath>
            <g clipPath="url(#pot)">
              <rect x="12" y="22" width="94" height="40" fill="#ff5a1f" opacity="0.18" />
              <circle className="animate-bubble" cx="40" cy="30" r="3.5" fill="#ff5a1f" />
              <circle className="animate-bubble" cx="62" cy="27" r="4" fill="#12a150" style={{ animationDelay: '0.4s' }} />
              <circle className="animate-bubble" cx="80" cy="31" r="3" fill="#f8cb46" style={{ animationDelay: '0.8s' }} />
              <circle className="animate-bubble" cx="52" cy="33" r="2.5" fill="#7c2ff0" style={{ animationDelay: '1.1s' }} />
            </g>
            <path
              d="M8 22h102M12 22v20a20 20 0 0 0 20 20h54a20 20 0 0 0 20-20V22"
              stroke="#1c1917"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M8 26c-5 0-5 8 0 8M110 26c5 0 5 8 0 8" stroke="#1c1917" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}
