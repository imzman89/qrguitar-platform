"use client";
import {useParams} from "next/navigation";
import Link from "next/link";
import {Nav} from "../../../components/Nav";
import {Footer} from "../../../components/Footer";
import {ServiceCorrections} from "../../../components/ServiceCorrections";
import styles from "../../../components/WorkflowWorkspace.module.css";
import {useUiText} from "../../../components/UiTextProvider";
export default function ServiceCorrectionPage(){
 const params=useParams(),ui=useUiText("components.ServiceCorrections");
 const id=typeof params.id==="string"?params.id:"";
 return <><Nav/><main className={styles.corrections+" service-work-page"}><section className="app-section"><div className="app-panel">
  <Link className="button secondary" href="/dashboard">{ui("ui.components.ServiceCorrections.back","Back to collection")}</Link>
  {/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)?<ServiceCorrections key={id} submissionId={id}/>:<p role="alert">{ui("ui.components.ServiceCorrections.unavailable","Approved service record unavailable.")}</p>}
 </div></section></main><Footer/></>;
}
