import { Database } from "jsr:@db/sqlite";
import { IMessage } from "$types/data.ts";

export class CustomDB {
  private dbPath: string;
  private db: Database;
  public messages: MessageHandler;

  constructor(dbPath: string | undefined) {
    this.dbPath = dbPath || "main.sqlite";
    this.db = new Database(this.dbPath);
    this.messages = new MessageHandler(this.db);
  }
}

class MessageHandler {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    this.init();
  }

  private init() {
    this.db.prepare(
      `
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message TEXT NOT NULL,
          number_to TEXT NOT NULL,
          number_from TEXT NOT NULL,
          unix_timestamp INTEGER NOT NULL
        );
      `,
    ).run();
  }
  
  public insertMessage(message: Omit<IMessage, "id" | "unix_timestamp">) {
    this.db.prepare(
      `
        INSERT INTO messages (message, number_to, number_from, unix_timestamp)
        VALUES (?, ?, ?, unixepoch());
      `,
    ).run(
      message.message,
      message.number_to,
      message.number_from,
    );
  }

  public deleteMessage(id: number) {
    this.db.prepare(
      `
        DELETE FROM messages
        WHERE id = ?;
      `,
    ).run(id);
  }

  public deleteMessages(
    number_to: string,
    number_from: string,
  ) {
    this.db.prepare(
      `
        DELETE FROM messages
        WHERE (number_to = ? AND number_from = ?) OR (number_to = ? AND number_from = ?);
      `,
    ).run(number_to, number_from, number_from, number_to);
  }

  public archiveMessage(id: number) {
    const message = this.db.prepare(
      `
        SELECT * FROM messages
        WHERE id = ?;
      `,
    ).get(id) as IMessage;

    this.db.prepare(
      `
        INSERT INTO message_archives (message, number_to, number_from, unix_timestamp)
        VALUES (?, ?, ?, unixepoch());
      `,
    ).run(
      message.message,
      message.number_to,
      message.number_from,
    );

    this.deleteMessage(id);
  }

  public archiveMessages(
    number_to: string,
    number_from: string,
  ) {
    const messages = this.db.prepare(
      `
        SELECT * FROM messages
        WHERE (number_to = ? AND number_from = ?) OR (number_to = ? AND number_from = ?);
      `,
    ).all(number_to, number_from, number_from, number_to) as IMessage[];

    messages.forEach((message) => {
      this.db.prepare(
        `
          INSERT INTO message_archives (user_id, message, number_to, number_from, unix_timestamp)
          VALUES (?, ?, ?, ?, unixepoch());
        `,
      ).run(
        message.message,
        message.number_to,
        message.number_from,
      );

      this.deleteMessage(message.id);
    });
  }

  public getMessages() {
    return this.db.prepare(
      `
        SELECT * FROM messages
      `,
    ).all() as IMessage[];
  }

  public getMessagesByNumbers(
    number_to: string,
    number_from: string,
  ) {
    return this.db.prepare(
      `
        SELECT * FROM messages
        WHERE (number_to = ? AND number_from = ?) OR (number_to = ? AND number_from = ?);
      `,
    ).all(
      number_to,
      number_from,
      number_from,
      number_to,
    ) as IMessage[];
  }
}