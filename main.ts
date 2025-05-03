import twilio from "twilio";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "https://jsr.io/@openai/openai/4.82.0/resources/index.ts";
import { CustomDB } from "$libs/db.ts";
import { Logger } from "$libs/logger.ts";
import { agent } from "$libs/agent.ts";
import { prompts } from "$libs/prompts.ts";
import { format } from "https://deno.land/std@0.91.0/datetime/mod.ts";

const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const twilioNumber = Deno.env.get("TWILIO_NUMBER") || "";

const openaiApiKey = Deno.env.get("OPENAI_API_KEY") || "";

const db = new CustomDB("main.sqlite");
const logger = new Logger(db);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.pathname.match(/^\/messages\/\+[0-9]+\.xlsx/)) {
    const filePathWithRoot = Deno.cwd() + "/" + url.pathname;
    const file = await Deno.open(filePathWithRoot, { read: true });
    return new Response(file.readable, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filePathWithRoot.split("/").pop()}"`
      },
    });
  }

  if (url.pathname.match(/^\/messages\/\+[0-9]+\.txt/)) {
    const filePathWithRoot = Deno.cwd() + "/" + url.pathname;
    const file = await Deno.open(filePathWithRoot, { read: true });
    return new Response(file.readable, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="${filePathWithRoot.split("/").pop()}"`
      },
    });
  }

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
    console.log(`Incoming message from ${callerNumber} [${format(new Date(), "yyyy-MM-dd - HH:mm:ss")}]: "${body}"`);
    inputs.push({ role: "user", content: body });
    db.messages.insertMessage({message: body, number_to: twilioNumber, number_from: callerNumber});
    logger.logMessage(callerNumber, twilioNumber, body);
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

  console.log(`Responding to ${callerNumber} using ${twilioNumber} [${format(new Date(), "yyyy-MM-dd - HH:mm:ss")}]: "${message.message}"`);

  db.messages.insertMessage(message);
  logger.logMessage(twilioNumber, callerNumber, message.message);

  if (body) {
    return new Promise((resolve) => {
      // Check if it has been over 2.5 minutes since the last message
      setTimeout(() => {
        const lastMessage = db.messages.getLastMessageByNumber(callerNumber, twilioNumber);
        if (lastMessage) {
          const currentTime = Date.now() / 1000;
          const timeDifference = currentTime - lastMessage.unix_timestamp;
          if (timeDifference > 150) { // 2.5 minutes in seconds
            // Archive the messages
            db.messages.archiveMessages(twilioNumber, callerNumber);
            logger.archiveMessages(callerNumber);

            // Send the excel logs of the conversation to the business owner
            const filePath = "/messages/" + callerNumber + ".zip";
            twilioClient.messages.create({
              body: `Your conversation with ${callerNumber} can be found at ${filePath}`,
              from: twilioNumber,
              to: agent.fallback_number || "",
            }).then(() => {
              console.log(`Sent conversation logs to ${agent.fallback_number || "noone in particular"} using ${twilioNumber}`);
            }).catch((error) => {
              console.error(`Failed to send conversation logs: ${error}`);
            })
          }
        }
        resolve(new Response("Thank you for your messages. We will get back to you shortly.", {status: 200}));
      }, 151000); // Slightly over 2.5 minutes
    })
  } else {
    return new Response("Sorry we could not take your call. Please leave a message.", {status: 200});
  }
  
});