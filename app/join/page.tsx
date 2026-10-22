"use client";
import { useEffect, useState } from "react";
import { LoaderCircle, Users } from "lucide-react";
export default function JoinPage() {
  const [error,setError]=useState("");
  useEffect(()=>{let cancelled=false;void(async()=>{try{
    const token=location.hash.slice(1);
    if(!/^[a-f0-9]{64}$/.test(token))throw new Error("El enlace de invitación no es válido.");
    const response=await fetch("/api/sharing",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"join",token})});
    if(response.status===401){location.assign("/signin-with-chatgpt?return_to="+encodeURIComponent("/join#"+token));return;}
    const result=await response.json() as {error?:string;id:string;project?:string};if(!response.ok)throw new Error(result.error||"No se pudo abrir el tablero.");
    if(!cancelled)location.replace(result.id?"/?diagram="+encodeURIComponent(result.id):"/");
  }catch(e){if(!cancelled)setError((e as Error).message);}})();return()=>{cancelled=true;};},[]);
  return <main className="join-page"><Users size={32}/><h1>{error?"No pudimos abrir la invitación":"Abriendo tu tablero compartido"}</h1>{error?<><p role="alert">{error}</p><a className="btn" href="/">Ir a mis diagramas</a></>:<p><LoaderCircle className="spin" size={18}/>Comprobando acceso…</p>}</main>;
}
