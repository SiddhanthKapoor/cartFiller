/** A little cooking pot with rising steam and bubbles — black & white. */
export function CookingLoader() {
  return (
    <div className="flex flex-col items-center py-3">
      <div className="relative h-[92px] w-[130px]">
        {/* steam */}
        <div className="absolute inset-x-0 top-0 flex justify-center gap-3">
          <span className="animate-steam1 h-5 w-[3px] rounded-full bg-ink/35" />
          <span className="animate-steam2 h-6 w-[3px] rounded-full bg-ink/35" />
          <span className="animate-steam3 h-5 w-[3px] rounded-full bg-ink/35" />
        </div>

        {/* pot */}
        <div className="animate-bob absolute bottom-0 left-1/2 -translate-x-1/2">
          <svg width="118" height="66" viewBox="0 0 118 66" fill="none">
            <clipPath id="pot">
              <path d="M12 22h94v20a20 20 0 0 1-20 20H32a20 20 0 0 1-20-20V22z" />
            </clipPath>
            <g clipPath="url(#pot)">
              <rect x="12" y="22" width="94" height="40" fill="#0a0a0a" opacity="0.08" />
              <circle className="animate-bubble" cx="42" cy="30" r="3.5" fill="#0a0a0a" opacity="0.65" />
              <circle className="animate-bubble" cx="66" cy="27" r="4" fill="#0a0a0a" opacity="0.45" style={{ animationDelay: '0.4s' }} />
              <circle className="animate-bubble" cx="82" cy="31" r="3" fill="#0a0a0a" opacity="0.7" style={{ animationDelay: '0.8s' }} />
            </g>
            <path
              d="M8 22h102M12 22v20a20 20 0 0 0 20 20h54a20 20 0 0 0 20-20V22"
              stroke="#0a0a0a"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M8 26c-5 0-5 8 0 8M110 26c5 0 5 8 0 8" stroke="#0a0a0a" strokeWidth="3.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  )
}
