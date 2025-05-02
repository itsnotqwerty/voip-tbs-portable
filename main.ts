import twilio from "twilio";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "https://jsr.io/@openai/openai/4.82.0/resources/index.ts";
import { IAgent } from "$types/data.ts";
import { CustomDB } from "$libs/db.ts";

type Prompt = {
  input: string;
  output: string;
}

const prompts: Prompt[] = [
  {
    input: "Hello, how are you?",
    output: "I'm doing well, thank you! How can I assist you today?",
  },
  {
    input: "What is your name?",
    output: "My name is Dummy.",
  },
  {
    input: "What is your business name?",
    output: "I represent Dummy Inc.",
  },
];

const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const twilioNumber = Deno.env.get("TWILIO_NUMBER") || "";
const twilioClient = twilio(accountSid, authToken);

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") || "";

console.log(openaiApiKey);

const agent: IAgent = {
  agent_name: "Dummy",
  business_name: "Dummy Inc.",
  personality: "Friendly",
  directives: "Be helpful and informative."
}

const db = new CustomDB("main.sqlite");

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const callerNumber = url.searchParams.get("From") as string;
  const body = url.searchParams.get("Body") as string;

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

  console.log(`Responding to ${callerNumber}: "${message.message}"`);

  db.messages.insertMessage(message);

  return new Response("Sorry we couldn't get to your call. Please leave a message.", { status: 200 });
});