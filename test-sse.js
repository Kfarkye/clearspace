const event = 'data: {"status":"success"}';
const dataStr = event.replace('data: ', '').trim();
console.log(dataStr);
try {
  JSON.parse(dataStr);
  console.log("Success");
} catch(e) {
  console.log("Error:", e.message);
}
