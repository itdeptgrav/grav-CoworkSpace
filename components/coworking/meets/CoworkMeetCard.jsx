"use client";
import { formatDate } from "../../../lib/coworkUtils";

export default function CoworkMeetCard({ meet }) {
  const isPast = new Date(meet.dateTime) < new Date();
  return (
    <div style={s.card}>
      <div style={s.top}>
        <div style={{flex:1}}>
          <h3 style={s.title}>{meet.title}</h3>
          {meet.description && <p style={s.desc}>{meet.description}</p>}
        </div>
        <span style={{...s.badge, background:isPast?"#f1f3f4":"#e6f4ea", color:isPast?"#80868b":"#1e8e3e"}}>{isPast?"Completed":"Upcoming"}</span>
      </div>
      <div style={s.meta}>
        <span style={s.metaItem}><span style={{marginRight:"6px"}}>📅</span>{formatDate(meet.dateTime)}</span>
        <span style={s.metaItem}><span style={{marginRight:"6px"}}>👥</span>{meet.participants?.length||0} participants</span>
        <span style={{...s.metaItem,fontFamily:"monospace",fontSize:"11px",color:"#9aa0a6"}}>{meet.meetId}</span>
      </div>
      <a href={meet.googleMeetLink} target="_blank" rel="noopener noreferrer"
        style={{...s.joinBtn, ...(isPast?s.joinBtnPast:{})}}
        onClick={e=>isPast&&e.preventDefault()}>
        <span style={{marginRight:"6px"}}>🎥</span>{isPast?"Meeting ended":"Join with Google Meet"}
      </a>
    </div>
  );
}
const s = {
  card:      { background:"#fff", borderRadius:"8px", padding:"18px 20px", border:"1px solid #e8eaed", display:"flex", flexDirection:"column", gap:"12px", fontFamily:"'Google Sans','Roboto',sans-serif" },
  top:       { display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"12px" },
  title:     { margin:"0 0 4px", fontSize:"15px", fontWeight:500, color:"#202124" },
  desc:      { margin:0, fontSize:"13px", color:"#5f6368" },
  badge:     { padding:"3px 12px", borderRadius:"12px", fontSize:"12px", fontWeight:500, whiteSpace:"nowrap" },
  meta:      { display:"flex", gap:"16px", flexWrap:"wrap", fontSize:"13px", color:"#5f6368" },
  metaItem:  { display:"flex", alignItems:"center" },
  joinBtn:   { display:"inline-flex", alignItems:"center", padding:"8px 18px", background:"#1a73e8", color:"#fff", borderRadius:"4px", textDecoration:"none", fontSize:"13px", fontWeight:500, alignSelf:"flex-start" },
  joinBtnPast:{ background:"#e8eaed", color:"#80868b", pointerEvents:"none" },
};
