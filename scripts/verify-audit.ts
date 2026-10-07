import 'dotenv/config';
import {verifyAudit,closeDatabase} from '@turkishpix/core';
const result=await verifyAudit();console.log(JSON.stringify(result,null,2));await closeDatabase();process.exitCode=result.valid?0:1;
