import twilio from "twilio";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "https://jsr.io/@openai/openai/4.82.0/resources/index.ts";
import { CustomDB } from "$libs/db.ts";
import { agent } from "$libs/agent.ts";
import { prompts } from "$libs/prompts.ts";
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const twilioNumber = Deno.env.get("TWILIO_NUMBER") || "";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") || "";

const db = new CustomDB("main.sqlite");

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const callerNumber = url.searchParams.get("From") as string;
  const body = url.searchParams.get("Body") as string;

  const twilioClient = twilio(accountSid, authToken);
  const openaiClient = new OpenAI({ apiKey: openaiApiKey });

  if (!callerNumber) {
    return new Response("No caller number provided.", { status: 400 });
  }

  const inputs: ChatCompletionMessageParam[] = [
    { role: "system", content: "You are a helpful assistant." },
  ];
  inputs.push({ role: "system", content: `Your name is ${agent.agent_name}.` });
  inputs.push({ role: "system", content: `You are a representative for ${agent.business_name}.` });
  inputs.push({ role: "system", content: `Your personality is as follows: ${agent.personality}` });
  inputs.push({ role: "system", content: `Your directions are as follows: ${agent.directives}` });
  if (agent.fallback_contact && agent.fallback_number) {
    inputs.push({ role: "system", content: `If you are unable to assist a customer, direct them to contact ${agent.fallback_contact} at ${agent.fallback_number}.` });
  }

  prompts.forEach((prompt) => {
    inputs.push({ role: "user", content: `EXAMPLE INPUT: "${prompt.input}"` });
    inputs.push({ role: "assistant", content: `EXAMPLE OUTPUT: "${prompt.output}"` });
  });

  const messages = db.messages.getMessagesByNumbers(twilioNumber, callerNumber);

  messages.forEach((message) => {
    if (message.number_to === twilioNumber) {
      inputs.push({ role: "user", content: message.message });
    } else {
      inputs.push({ role: "assistant", content: message.message });
    }
  });

  if (body) {
    console.log(`Incoming message from ${callerNumber}: "${body}"`);
    inputs.push({ role: "user", content: body });
    db.messages.insertMessage({message: body, number_to: twilioNumber, number_from: callerNumber});
    const table = XLSX.utils.json_to_sheet([
      { number_to: twilioNumber, number_from: callerNumber, message: body, unix_timestamp: Date.now() / 1000 },
    ])
    const book = XLSX.readFile("messages.xlsx", { cellDates: true });
    const sheet = book.Sheets[book.SheetNames[0]];
    XLSX.utils.sheet_add_json(sheet, [table], { skipHeader: true, origin: -1 });
    XLSX.writeFile(book, "messages.xlsx", { cellDates: true });
  } else {
    console.log(`Incoming call from ${callerNumber}`);
    inputs.push({ role: "system", content: "You are taking an inquiry. Introduce the business and ask the user what they need."});
  }

  const completion = await openaiClient.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: inputs,
    max_tokens: 1000,
    temperature: 0.5,
  });

  const message = {
    message: completion.choices[0].message.content as string,
    number_to: callerNumber,
    number_from: twilioNumber,
  }

  twilioClient.messages.create({
    body: message.message,
    from: twilioNumber,
    to: callerNumber,
  });

  console.log(`Responding to ${callerNumber} using ${twilioNumber}: "${message.message}"`);

  db.messages.insertMessage(message);

  const table = XLSX.utils.json_to_sheet([
    { number_to: callerNumber, number_from: twilioNumber, message: body, unix_timestamp: Date.now() / 1000 },
  ])
  const book = XLSX.readFile("messages.xlsx", { cellDates: true });
  const sheet = book.Sheets[book.SheetNames[0]];
  XLSX.utils.sheet_add_json(sheet, [table], { skipHeader: true, origin: -1 });
  XLSX.writeFile(book, "messages.xlsx", { cellDates: true });

  return new Response(body ? "" : "Sorry we couldn't get to your call. Please leave a message.", { status: 200 });
});