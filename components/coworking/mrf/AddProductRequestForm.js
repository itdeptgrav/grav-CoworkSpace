"use client"
import { useState, useEffect } from "react"
import ProductImageUploader from "./ProductImageUploader"

const C = {
  primary: "#1B4F8A", primaryLight: "#EBF2FA", primaryBorder: "#BFDBFE",
  border: "#E5E7EB", borderLight: "#F3F4F6", text: "#111827", textSub: "#4B5563",
  textMuted: "#9CA3AF", surface: "#F9FAFB", white: "#fff",
  red: "#B91C1C", redLight: "#FEF2F2", redBorder: "#FECACA",
  purple: "#7C3AED", purpleLight: "#F5F3FF", purpleBorder: "#DDD6FE",
}
const FONT = "'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif"

const GARMENT_ATTRIBUTE_NAMES = [
  "Color", "Size", "Fabric", "Fit", "GSM", "Gender", "Age Group", "Pattern", "Wash",
  "Style", "Finish", "Weave", "Weight", "Neck Type", "Sleeve Type", "Collar Type",
  "Pocket Type", "Closure", "Composition", "Count", "Length", "Rise", "Stretch",
]
const GARMENT_ATTRIBUTE_VALUES = {
  color: ["Red", "Blue", "Green", "Black", "White", "Navy", "Grey", "Beige", "Brown", "Yellow", "Orange", "Pink", "Purple", "Maroon", "Olive", "Teal", "Charcoal", "Off-White", "Ivory", "Cream", "Rust", "Mustard", "Burgundy", "Coral", "Peach"],
  size: ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "28", "30", "32", "34", "36", "38", "40", "42", "44", "Free Size"],
  fit: ["Regular", "Slim", "Loose", "Oversized", "Tailored", "Relaxed", "Athletic", "Straight", "Skinny", "Bootcut"],
  gsm: ["80", "100", "120", "140", "160", "180", "200", "220", "240", "260", "280", "300", "320"],
  gender: ["Men", "Women", "Unisex", "Boys", "Girls", "Kids"],
  "age group": ["Adult", "Kids", "Infant", "Toddler", "Teen"],
  pattern: ["Solid", "Stripe", "Check", "Print", "Floral", "Geometric", "Abstract", "Camouflage", "Polka Dot", "Plain", "Tie-Dye", "Ombre"],
  wash: ["Stone Wash", "Acid Wash", "Sand Wash", "Enzyme Wash", "Bleach Wash", "Raw", "Distressed", "Vintage Wash"],
  style: ["Casual", "Formal", "Sports", "Party", "Ethnic", "Western", "Streetwear", "Workwear"],
  finish: ["Matte", "Glossy", "Satin", "Brushed", "Peach Finish", "Silicone Finish", "Anti-pill"],
  weave: ["Plain", "Twill", "Satin", "Rib", "Interlock", "Jersey", "Fleece", "Pique", "Waffle", "Ottoman"],
  "neck type": ["Round Neck", "V-Neck", "Polo", "Crew Neck", "Scoop Neck", "Boat Neck", "Turtle Neck", "Hooded", "Square Neck"],
  "sleeve type": ["Full Sleeve", "Half Sleeve", "Sleeveless", "3/4 Sleeve", "Cap Sleeve", "Raglan", "Puff Sleeve"],
  "collar type": ["Spread", "Point", "Button-down", "Mandarin", "Band", "Cutaway", "Club"],
  closure: ["Button", "Zip", "Snap", "Hook & Eye", "Velcro", "Drawstring", "Elastic", "Magnetic"],
  "pocket type": ["Chest Pocket", "Side Pocket", "Back Pocket", "Welt Pocket", "Patch Pocket", "No Pocket"],
  weight: ["Light", "Medium", "Heavy", "Ultra-light"],
  length: ["Crop", "Regular", "Long", "Midi", "Maxi", "Mini", "Knee-length"],
  stretch: ["No Stretch", "2-way Stretch", "4-way Stretch"],
  rise: ["Low Rise", "Mid Rise", "High Rise"],
}
const getValueSuggestions = (n) => GARMENT_ATTRIBUTE_VALUES[(n || "").toLowerCase().trim()] || []

const emptyProduct = () => ({ itemName: "", category: "", unit: "", requestedQty: "", notes: "", attributes: [], images: [] })
const emptyAttribute = () => ({ name: "", values: [""] })

export default function AddProductRequestForm({
  products, setProducts, categories, units, formError,
}) {
  const iS = { padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontFamily: FONT, color: C.text, background: C.white, outline: "none", width: "100%", boxSizing: "border-box" }
  const fBlue = e => { e.target.style.borderColor = C.primary }
  const fGray = e => { e.target.style.borderColor = C.border }

  const addProductRow = () => setProducts(p => [...p, emptyProduct()])
  const removeProductRow = (idx) => setProducts(p => p.filter((_, i) => i !== idx))
  const updateProductRow = (idx, field, value) => setProducts(p => p.map((row, i) => i === idx ? { ...row, [field]: value } : row))

  const addAttribute = (pIdx) => setProducts(p => p.map((row, i) => i === pIdx ? { ...row, attributes: [...row.attributes, emptyAttribute()] } : row))
  const removeAttribute = (pIdx, aIdx) => setProducts(p => p.map((row, i) => i === pIdx ? { ...row, attributes: row.attributes.filter((_, j) => j !== aIdx) } : row))
  const updateAttrName = (pIdx, aIdx, value) => setProducts(p => p.map((row, i) => {
    if (i !== pIdx) return row
    return { ...row, attributes: row.attributes.map((a, j) => j === aIdx ? { ...a, name: value } : a) }
  }))
  const updateAttrValue = (pIdx, aIdx, vIdx, value) => setProducts(p => p.map((row, i) => {
    if (i !== pIdx) return row
    return { ...row, attributes: row.attributes.map((a, j) => j === aIdx ? { ...a, values: a.values.map((v, k) => k === vIdx ? value : v) } : a) }
  }))
  const addAttrValue = (pIdx, aIdx) => setProducts(p => p.map((row, i) => {
    if (i !== pIdx) return row
    return { ...row, attributes: row.attributes.map((a, j) => j === aIdx ? { ...a, values: [...a.values, ""] } : a) }
  }))
  const removeAttrValue = (pIdx, aIdx, vIdx) => setProducts(p => p.map((row, i) => {
    if (i !== pIdx) return row
    return {
      ...row, attributes: row.attributes.map((a, j) => {
        if (j !== aIdx || a.values.length <= 1) return a
        return { ...a, values: a.values.filter((_, k) => k !== vIdx) }
      })
    }
  }))

  return (
    <>
      <div style={{ padding: "8px 11px", background: C.purpleLight, border: `1px solid ${C.purpleBorder}`, borderRadius: 5, fontSize: 11, color: C.purple, lineHeight: 1.4 }}>
        This raises a material request like any other — it just isn't in the catalogue yet. The Store will match it to an existing item or add it as new before issuing it.
      </div>

      {products.map((p, pIdx) => (
        <div key={pIdx} style={{ border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px", background: C.surface }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: "0.05em" }}>item Details</span>
            {products.length > 1 && (
              <button type="button" onClick={() => removeProductRow(pIdx)} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, fontSize: 11, fontWeight: 600, fontFamily: FONT }}>Remove</button>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Item Name *</div>
              <input type="text" value={p.itemName} onChange={e => updateProductRow(pIdx, "itemName", e.target.value)} placeholder="e.g. Cotton Poplin Fabric" style={iS} onFocus={fBlue} onBlur={fGray} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {/* Category — suggested via datalist, not free guessing */}
              <div>
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Category (optional)</div>
                <input type="text" list={`cat-list-${pIdx}`} value={p.category}
                  onChange={e => updateProductRow(pIdx, "category", e.target.value)}
                  placeholder="e.g. Fabric" style={iS} onFocus={fBlue} onBlur={fGray} />
                <datalist id={`cat-list-${pIdx}`}>
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              {/* Quantity — how much the employee needs. Required: this is a
                  real material request now, not just a catalogue registration. */}
              <div>
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Quantity *</div>
                <input type="number" min="0" step="any" value={p.requestedQty}
                  onChange={e => updateProductRow(pIdx, "requestedQty", e.target.value)}
                  placeholder="e.g. 22" style={iS} onFocus={fBlue} onBlur={fGray} />
              </div>
              {/* Unit — suggested via datalist from existing Unit collection */}
              <div>
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Unit *</div>
                <input type="text" list={`unit-list-${pIdx}`} value={p.unit}
                  onChange={e => updateProductRow(pIdx, "unit", e.target.value)}
                  placeholder="e.g. Metre, Kg, Pieces" style={iS} onFocus={fBlue} onBlur={fGray} />
                <datalist id={`unit-list-${pIdx}`}>
                  {units.map(u => <option key={u} value={u} />)}
                </datalist>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 3 }}>Notes (optional)</div>
              <textarea rows={2} value={p.notes} onChange={e => updateProductRow(pIdx, "notes", e.target.value)} placeholder="Any details that help the store find/source this" style={{ ...iS, resize: "none" }} onFocus={fBlue} onBlur={fGray} />
            </div>

            {/* A photo is often the fastest way for the store to recognise a
                product that isn't in the catalogue yet. */}
            <ProductImageUploader
              images={p.images || []}
              onChange={imgs => updateProductRow(pIdx, "images", imgs)}
              folder="mrf-product-requests"
              label="Reference Photo(s)"
              compact
            />

            {/* Attributes → values, same parent/child structure as the store RawItemForm */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>

              </div>
              {p.attributes.length === 0 && (
                <div style={{ fontSize: 10, color: C.textMuted, fontStyle: "italic" }}>No attributes — single item, no variants.</div>
              )}
              {p.attributes.map((a, aIdx) => (
                <div key={aIdx} style={{ border: `1px solid ${C.border}`, borderRadius: 5, padding: "8px", marginBottom: 6, background: C.white }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.textSub }}>Attribute {aIdx + 1}</span>
                    <button type="button" onClick={() => removeAttribute(pIdx, aIdx)} style={{ background: "none", border: "none", cursor: "pointer", color: C.red, fontSize: 10, fontFamily: FONT }}>Remove</button>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <input type="text" list="garment-attr-names" value={a.name}
                      onChange={e => updateAttrName(pIdx, aIdx, e.target.value)}
                      placeholder="Attribute name (e.g. Color)"
                      style={{ ...iS, fontSize: 11, padding: "5px 8px" }} onFocus={fBlue} onBlur={fGray} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 9, color: C.textMuted, textTransform: "uppercase" }}>Values</span>
                    <button type="button" onClick={() => addAttrValue(pIdx, aIdx)} style={{ background: "none", border: "none", cursor: "pointer", color: C.primary, fontSize: 10, fontFamily: FONT }}>+ Add Value</button>
                  </div>
                  {getValueSuggestions(a.name).length > 0 && (
                    <datalist id={`attr-vals-${pIdx}-${aIdx}`}>
                      {getValueSuggestions(a.name).map(s => <option key={s} value={s} />)}
                    </datalist>
                  )}
                  {a.values.map((val, vIdx) => (
                    <div key={vIdx} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <input type="text" value={val}
                        list={getValueSuggestions(a.name).length > 0 ? `attr-vals-${pIdx}-${aIdx}` : undefined}
                        onChange={e => updateAttrValue(pIdx, aIdx, vIdx, e.target.value)}
                        placeholder="Value (e.g. Red)"
                        style={{ ...iS, padding: "5px 8px", fontSize: 11 }} onFocus={fBlue} onBlur={fGray} />
                      {a.values.length > 1 && (
                        <button type="button" onClick={() => removeAttrValue(pIdx, aIdx, vIdx)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMuted, fontSize: 14, lineHeight: 1 }}>×</button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      <datalist id="garment-attr-names">
        {GARMENT_ATTRIBUTE_NAMES.map(n => <option key={n} value={n} />)}
      </datalist>

      <button type="button" onClick={addProductRow} style={{ padding: "9px", border: `1px dashed ${C.purpleBorder}`, borderRadius: 6, background: C.purpleLight, color: C.purple, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: FONT }}>
        + Add New Product
      </button>
    </>
  )
}

export { emptyProduct }