#!/usr/bin/env node

import { Command } from "commander"
import { devCommand } from "./commands/dev.js"
import { generateCommand } from "./commands/generate.js"
import { auditCommand } from "./commands/audit.js"
import { addCommand } from "./commands/add.js"

const program = new Command()
  .name("helpbase")
  .description("CLI for managing your Helpbase help center")
  .version("0.0.1")

program.addCommand(devCommand)
program.addCommand(generateCommand)
program.addCommand(auditCommand)
program.addCommand(addCommand)

program.parse()
