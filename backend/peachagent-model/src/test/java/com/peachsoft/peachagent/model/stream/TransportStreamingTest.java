package com.peachsoft.peachagent.model.stream;

import com.peachsoft.peachagent.model.ControlledTransport;
import com.peachsoft.peachagent.model.ModelExecutionContext;
import com.peachsoft.peachagent.model.ModelExecutionRequest;
import com.peachsoft.peachagent.model.NetworkPolicy;
import com.peachsoft.peachagent.model.OpenAiCompatibleAdapter;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** 通过实际 HTTP 连接验证首片段先于固定长度或 chunked 响应尾部到达。 */
class TransportStreamingTest {
    @Test
    void fixedLengthAndChunkedDeliverFirstFrame() throws Exception {
        for(boolean chunked:List.of(false,true)){
            CountDownLatch release=new CountDownLatch(1);
            CountDownLatch first=new CountDownLatch(1);
            HttpServer server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            byte[] prefix="data: {\"choices\":[{\"delta\":{\"content\":\"first\"}}]}\n\n".getBytes(StandardCharsets.UTF_8);
            byte[] tail="data: {\"choices\":[],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":1,\"total_tokens\":2}}\n\ndata: [DONE]\n\n".getBytes(StandardCharsets.UTF_8);
            server.createContext("/chat/completions",exchange->{
                try(exchange){
                    exchange.getRequestBody().readAllBytes();
                    exchange.getResponseHeaders().set("Content-Type","text/event-stream");
                    exchange.sendResponseHeaders(200,chunked?0:prefix.length+tail.length);
                    var out=exchange.getResponseBody();
                    out.write(prefix);out.flush();
                    try{
                        if(!release.await(5,TimeUnit.SECONDS))return;
                    }catch(InterruptedException ex){Thread.currentThread().interrupt();return;}
                    out.write(tail);out.flush();
                }
            });
            server.start();
            String origin="http://127.0.0.1:"+server.getAddress().getPort();
            var transport=new ControlledTransport(new NetworkPolicy(origin));
            var adapter=new OpenAiCompatibleAdapter(JsonMapper.builder().build(),"qa.streaming","LLM","CHAT","chat/completions");
            var context=new ModelExecutionContext(transport.bind(origin,"NONE",null,10000),delta->{
                assertEquals("first",delta);
                first.countDown();
            });
            try(var executor=Executors.newSingleThreadExecutor()){
                var future=executor.submit(()->adapter.execute(new ModelExecutionRequest("CHAT","fixture",
                        List.of(new ModelExecutionRequest.Message("user","test")),Map.of(),Map.of(),32,null),context));
                try{
                    assertTrue(first.await(3,TimeUnit.SECONDS),"HTTP transport held first frame until final bytes");
                    assertFalse(future.isDone());
                    release.countDown();
                    var result=future.get(5,TimeUnit.SECONDS);
                    assertEquals("first",result.result().get("text"));
                    assertEquals(2L,result.usage().totalTokens());
                }finally{
                    release.countDown();
                    context.cancel();
                }
            }finally{
                server.stop(0);
            }
        }
    }
}
