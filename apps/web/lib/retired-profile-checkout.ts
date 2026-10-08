/** New Profile-credit sales are retired. Earlier receipts/recovery remain separate. */
export async function retiredProfileCheckout() {
 return Response.json({code:"profiles_are_free",message:"Profiles are always free. Verification and authentication are separate optional paid services."},{status:410,headers:{"Cache-Control":"no-store"}});
}
