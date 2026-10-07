import 'dotenv/config';
import {readiness,config} from '@turkishpix/core';
const r=readiness();for(const [name,ok] of Object.entries(r.checks))console.log(`${ok?'✓':'✗'} ${name}`);
console.log(`Owner onayı: ${config().quorum}/4 • Süre: ${config().ballotHours} saat • Önizleme: ${r.demo?'açık':'kapalı'}`);
process.exitCode=r.ready?0:1;
