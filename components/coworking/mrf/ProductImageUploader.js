// components/coworking/mrf/ProductImageUploader.js
//
// Attaches reference photos to a requested product. The images travel with the
// MRF and are visible to the requester, the approving TL and the Store Person,
// so everyone can see exactly which product is meant.
"use client"

import { useRef, useState, useEffect } from "react"
import { uploadProductImage } from "../../../lib/mrfApi"

const C = {
  primary: "#1B4F8A", primaryLight: "#EBF2FA", primaryBorder: "#BFDBFE",
  border: "#E5E7EB", text: "#111827", textSub: "#4B5563", textMuted: "#9CA3AF",
  surface: "#F9FAFB", white: "#fff", red: "#B91C1C",
}
const FONT = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif"

const MAX = 5
const MAX_BYTES = 8 * 1024 * 1024

/**
 * Full-size image overlay.
 *
 * Thumbnails are cropped squares, so they are useless for actually checking a
 * product photo. Opening a new browser tab instead would lose whatever the
 * reviewer was looking at, which is the wrong thing to do mid-approval — so
 * the full image renders over the page and Escape closes it.
 *
 * Shared by the uploader (so the requester can verify what they just attached)
 * and by ProductImageStrip (so the TL and Store can inspect it).
 */
export function ImageLightbox({ images = [], index, onIndex, onClose }) {
  useEffect(() => {
    if (index === null || index === undefined) return
    const onKey = (e) => {
      if (e.key === "Escape") onClose()
      if (e.key === "ArrowRight") onIndex((index + 1) % images.length)
      if (e.key === "ArrowLeft") onIndex((index - 1 + images.length) % images.length)
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [index, images.length, onIndex, onClose])

  if (index === null || index === undefined) return null
  const current = images[index]
  if (!current) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.82)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, cursor: "zoom-out",
      }}
    >
      <img
        src={current.url}
        alt={current.name || "Product image"}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6, cursor: "default" }}
      />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose() }}
        aria-label="Close"
        style={{ position: "fixed", top: 16, right: 18, width: 34, height: 34, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 20, cursor: "pointer", lineHeight: 1 }}
      >×</button>

      {images.length > 1 && (
        <>
          <button type="button" aria-label="Previous image"
            onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + images.length) % images.length) }}
            style={{ position: "fixed", left: 14, top: "50%", transform: "translateY(-50%)", width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 20, cursor: "pointer" }}
          >‹</button>
          <button type="button" aria-label="Next image"
            onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % images.length) }}
            style={{ position: "fixed", right: 14, top: "50%", transform: "translateY(-50%)", width: 38, height: 38, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 20, cursor: "pointer" }}
          >›</button>
        </>
      )}

      <div style={{ position: "fixed", bottom: 18, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 12, fontFamily: FONT, opacity: 0.85 }}>
        {images.length > 1 ? `${index + 1} / ${images.length}` : ""}
        {current.name ? `${images.length > 1 ? " · " : ""}${current.name}` : ""}
      </div>
    </div>
  )
}

export default function ProductImageUploader({
  images = [],
  onChange,
  folder = "mrf-products",
  label = "Product Image(s)",
  compact = false,
}) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  // So the requester can check the photo they just attached is the right one
  // — a 46px cropped square tells them nothing.
  const [zoomAt, setZoomAt] = useState(null)

  const pick = async (files) => {
    const chosen = Array.from(files || [])
    if (!chosen.length) return
    setError("")

    const room = MAX - images.length
    if (room <= 0) { setError(`Up to ${MAX} images per product.`); return }

    const valid = []
    for (const f of chosen.slice(0, room)) {
      if (!f.type.startsWith("image/")) { setError("Only image files can be attached."); continue }
      if (f.size > MAX_BYTES) { setError(`"${f.name}" is over 8 MB — please attach a smaller image.`); continue }
      valid.push(f)
    }
    if (!valid.length) { if (inputRef.current) inputRef.current.value = ""; return }

    setBusy(true)
    const uploaded = []
    const failed = []
    // Upload one at a time so a single failure doesn't discard the rest —
    // a dropped photo must never cost the requester the ones that worked.
    for (const f of valid) {
      try { uploaded.push(await uploadProductImage(f, folder)) }
      // Keep the server's reason. Swallowing it leaves the user staring at
      // "could not be uploaded" with no way to tell a bad file from a broken
      // Cloudinary credential, which is exactly the wrong thing to hide.
      catch (err) { failed.push({ name: f.name, reason: err?.message || "" }) }
    }
    if (uploaded.length) onChange?.([...images, ...uploaded])
    if (failed.length) {
      const names = failed.map(f => f.name).join(", ")
      // Distinct reasons only — five files failing for one reason should read
      // as one problem, not five.
      const reasons = [...new Set(failed.map(f => f.reason).filter(Boolean))]
      setError(
        (uploaded.length
          ? `${names} could not be uploaded — the others were attached.`
          : `${names} could not be uploaded. You can submit without images and add them in the request chat later.`)
        + (reasons.length ? ` (${reasons.join("; ")})` : "")
      )
    }
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ""
  }

  const remove = (i) => onChange?.(images.filter((_, x) => x !== i))
  const size = compact ? 46 : 58

  return (
    <div>
      {label && (
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
          {label} <span style={{ color: C.textMuted, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>— optional, helps the TL and Store identify it</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {images.map((im, i) => (
          <div key={im.publicId || im.url || i} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setZoomAt(i)}
              title="Click to check the full image"
              style={{ padding: 0, border: "none", background: "none", cursor: "zoom-in", lineHeight: 0, display: "block" }}
            >
              <img
                src={im.url}
                alt={im.name || `Product image ${i + 1}`}
                style={{ width: size, height: size, objectFit: "cover", borderRadius: 6, border: `1px solid ${C.border}`, display: "block" }}
              />
            </button>
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${im.name || "image"}`}
              style={{ position: "absolute", top: -6, right: -6, width: 17, height: 17, borderRadius: "50%", border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 11, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
            >×</button>
          </div>
        ))}

        {images.length < MAX && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            style={{
              width: size, height: size, borderRadius: 6,
              border: `1.5px dashed ${busy ? C.border : C.primaryBorder}`,
              background: busy ? C.surface : C.primaryLight,
              cursor: busy ? "wait" : "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 2, color: C.primary, fontFamily: FONT, padding: 0,
            }}
          >
            {busy ? (
              <span style={{ fontSize: 9, fontWeight: 600 }}>…</span>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                <span style={{ fontSize: 8.5, fontWeight: 700 }}>Add</span>
              </>
            )}
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => pick(e.target.files)}
        />
      </div>

      {error && <div style={{ fontSize: 10.5, color: C.red, marginTop: 5 }}>{error}</div>}

      <ImageLightbox images={images} index={zoomAt} onIndex={setZoomAt} onClose={() => setZoomAt(null)} />
    </div>
  )
}


/**
 * Read-only thumbnail strip. Clicking any thumbnail opens the shared
 * ImageLightbox, so a TL or Store Person can actually inspect the photo the
 * requester attached instead of squinting at a cropped square.
 */
export function ProductImageStrip({ images = [], size = 44 }) {
  const [openAt, setOpenAt] = useState(null)
  if (!images.length) return null

  return (
    <>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {images.map((im, i) => (
          <button
            key={im.publicId || im.url || i}
            type="button"
            // These strips sit inside clickable cards — don't trigger the card.
            onClick={(e) => { e.stopPropagation(); setOpenAt(i) }}
            title={im.name || "Click to enlarge"}
            style={{ padding: 0, border: "none", background: "none", cursor: "zoom-in", lineHeight: 0 }}
          >
            <img
              src={im.url}
              alt={im.name || `Product image ${i + 1}`}
              style={{ width: size, height: size, objectFit: "cover", borderRadius: 5, border: "1px solid #E5E7EB", display: "block" }}
            />
          </button>
        ))}
      </div>

      <ImageLightbox images={images} index={openAt} onIndex={setOpenAt} onClose={() => setOpenAt(null)} />
    </>
  )
}
