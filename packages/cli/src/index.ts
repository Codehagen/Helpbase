#!/usr/bin/env node

import { Command } from "commander"
import { devCommand } from "./commands/dev.js"
import { generateCommand } from "./commands/generate.js"
import { auditCommand } from "./commands/audit.js"
import { addCommand } from "./commands/add.js"
import { newCommand } from "./commands/new.js"
import { deployCommand } from "./commands/deploy.js"
import { loginCommand } from "./commands/login.js"
import { logoutCommand } from "./commands/logout.js"
import { whoamiCommand } from "./commands/whoami.js"
import { linkCommand } from "./commands/link.js"
import { openCommand } from "./commands/open.js"

const program = new Command()
  .name("helpbase")
  .description("CLI for managing your Helpbase help center")
  .version("0.0.1")

program.addCommand(devCommand)
program.addCommand(generateCommand)
program.addCommand(auditCommand)
program.addCommand(addCommand)
program.addCommand(newCommand)
program.addCommand(deployCommand)
program.addCommand(loginCommand)
program.addCommand(logoutCommand)
program.addCommand(whoamiCommand)
program.addCommand(linkCommand)
program.addCommand(openCommand)

program.parse()
