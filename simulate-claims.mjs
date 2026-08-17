import { Context } from '@deepseek-ai/cordis';
import { CompanionRemote } from './packages/dsh-companion/lib/index.js';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';

const ctx = new Context();
const fiber = ctx.plugin(CompanionRemote);
await fiber;

console.log('=== reflect.props(全部) ===');
console.log(Object.keys(ctx.reflect.props).join(','));

const receiver = ctx.get('travelNoteCompanion');
console.log('=== ctx.get(travelNoteCompanion) ===', receiver !== undefined);
if (receiver) {
  const binding = receiver.typertRemote;
  console.log('=== typertRemote binding ===', binding ? JSON.stringify(binding) : 'MISSING');
  console.log('=== remoteMethods ===', remoteMethods(receiver).map((m) => m.method).join(','));
}
