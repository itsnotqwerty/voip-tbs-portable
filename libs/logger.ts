// @deno-types="https://cdn.sheetjs.com/xlsx-0.20.3/package/types/index.d.ts"
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
import {
  BlobReader,
  BlobWriter,
  ZipWriter,
} from "https://deno.land/x/zipjs@v2.7.60/index.js";
import { format } from "https://deno.land/std@0.91.0/datetime/mod.ts";
import { exists } from "https://deno.land/std@0.224.0/fs/mod.ts";
import { agent } from "$libs/agent.ts";
import { IMessage } from "$types/data.ts";
import { CustomDB } from "./db.ts";

export class Logger {
  private db: CustomDB;
  private XLSXHandler: XLSXHandler; // Placeholder for XLSX handler
  private TXTHandler: TXTHandler; // Placeholder for TXT handler

  constructor(db: CustomDB) {
    this.db = db;
    this.XLSXHandler = new XLSXHandler();
    this.TXTHandler = new TXTHandler();
  }

  public logMessage(to: string, from: string, message: string) {
    const timestamp = new Date().toISOString();
    const formattedMessage = this.formatMessage(to, from, message, timestamp);
    this.XLSXHandler.logToFile(formattedMessage);
    this.TXTHandler.logToFile(formattedMessage);
  }

  public formatMessage(to: string, from: string, message: string, timestamp: string): Omit<IMessage, "id"> {
    return {
      message: message,
      number_to: to,
      number_from: from,
      unix_timestamp: Math.floor(new Date(timestamp).getTime() / 1000),
    };
  }

  // ZIP functionality has been deprecated in favor of text logging.
  /* public archiveMessages(number: string) {
    const files = [
      `messages/${number}.xlsx`,
      `messages/${number}.txt`,
    ]; const zipFileName = `messages/${number}.zip`;
    const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
    for (const file of files) {
      const fileReader = new BlobReader(new Blob([Deno.readFileSync(file)]));
      zipWriter.add(file, fileReader);
    }
    zipWriter.close().then(async (blob: Blob) => {
      Deno.writeFileSync(zipFileName, new Uint8Array(await blob.arrayBuffer()));
      for (const file of files) {
        Deno.removeSync(file);
      }
      console.log(`Archived messages for ${number} into ${zipFileName}`);
    }).catch((error: Error) => {
      console.error(`Failed to archive messages for ${number}: ${error}`);
    });
  } */
}

class XLSXHandler {
  constructor() {
    // Initialize XLSX handler
  }

  public logToFile(message: Omit<IMessage, "id">) {
    const callerNumber = (Deno.env.get("TWILIO_NUMBER") == message.number_from) ? message.number_to : message.number_from;
    const fileName = `messages/${callerNumber}.xlsx`;

    let book: XLSX.WorkBook;
    try {
      book = XLSX.readFile(fileName, { cellDates: true });
    } catch (_e) {
      book = XLSX.utils.book_new();
    }

    const sheet = book.Sheets[book.SheetNames[0]];
    if (!book.SheetNames.length) {
      XLSX.utils.book_append_sheet(book, sheet, "Messages");
    } else {
      book.Sheets[book.SheetNames[0]] = sheet;
    }

    const table = XLSX.utils.json_to_sheet([message]);
    XLSX.utils.sheet_add_json(sheet, [table], { skipHeader: true, origin: -1 });

    XLSX.writeFile(book, fileName, { cellDates: true });
  }
}

class TXTHandler {
  constructor() {
    // Initialize TXT handler
  }

  public async logToFile(message: Omit<IMessage, "id">) {
    const callerNumber = (Deno.env.get("TWILIO_NUMBER") == message.number_from) ? message.number_to : message.number_from;
    const fileName = `messages/${callerNumber}.txt`;

    if (!(await exists(fileName))) {
      const header = `
      ==================================================
      TICKET FOR: ${callerNumber}
      BUSINESS NAME: ${agent.business_name}
      TIMESTAMP: ${format(new Date(), "yyyy-MM-dd - HH:mm:ss")}
      ==================================================
      `
      Deno.writeTextFileSync(fileName, header, { append: true });
    }
    
    const formattedMessage = `${format(new Date(), "yyyy-MM-dd - HH:mm:ss")} - FROM [${message.number_to}] TO [${message.number_from}]: ${message.message}\n`;
    Deno.writeTextFileSync(fileName, formattedMessage, { append: true });
  }
}
