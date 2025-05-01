import twilio from "twilio";
import OpenAI from "openai";

const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const twilioClient = twilio(accountSid, authToken);
const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY") || "",
});

Deno.serve((req) => {
  const url = new URL(req.url);
  const caller_number = url.searchParams.get("From");


  return new Response("Hello World");
});