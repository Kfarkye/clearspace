import * as spannerDAL from './backend/services/db.js';
async function run() {
  try {
    await spannerDAL.ensureUser({userId: "test-user"});
    await spannerDAL.createConversation("test-user", "operator", "test");
    const convs = await spannerDAL.getConversations("test-user");
    await spannerDAL.appendMessage("test-user", convs[0].conversationId, {role: "user", content: "test"});
    console.log("Success!");
  } catch(e) {
    console.error("Error:", e);
  } finally {
    await spannerDAL.closeSpanner();
  }
}
run();
