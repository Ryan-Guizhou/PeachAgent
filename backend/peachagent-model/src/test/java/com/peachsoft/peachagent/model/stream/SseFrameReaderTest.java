package com.peachsoft.peachagent.model.stream;

import com.peachsoft.peachagent.common.DomainException;

import java.io.ByteArrayInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.PipedInputStream;
import java.io.PipedOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 验证首片段、拆包编码、换行及解析边界。
 * @Author Mr Shu
 * @Version 1.0.0
 * @CreateTime 2026/11/24 17:48
 */
class SseFrameReaderTest {

    @Test
    void firstFrameArrivesBeforeTerminalBytes() throws Exception {
        try (var output = new PipedOutputStream();
                var input = new PipedInputStream(output);
                var executor = Executors.newSingleThreadExecutor()) {
            CountDownLatch first = new CountDownLatch(1);
            var future = executor.submit(() -> SseFrameReader.read(input, (event, data) -> {
                assertEquals("delta", event);
                assertEquals("{\"text\":\"first\"}", data);
                first.countDown();
            }));
            try {
                output.write("event: delta\r\ndata: {\"text\":\"first\"}\r\n\r\n".getBytes(StandardCharsets.UTF_8));
                output.flush();
                assertTrue(first.await(3, TimeUnit.SECONDS), "First event was held until terminal bytes");
                assertFalse(future.isDone());
                output.write("data: [DONE]\n\n".getBytes(StandardCharsets.UTF_8));
                output.flush();
                assertTrue(future.get(3, TimeUnit.SECONDS));
            } finally {
                output.close();
            }
        }
    }

    @Test
    void handlesSplitUtf8AndLineEndings() throws Exception {
        byte[] bytes = "event: delta\rdata: {\"text\":\rdata: \"你好\"}\r\rdata: [DONE]\r\n\r\n"
                .getBytes(StandardCharsets.UTF_8);
        List<String> frames = new ArrayList<>();
        try (var stream = new FilterInputStream(new ByteArrayInputStream(bytes)) {
            @Override
            public int read(byte[] buffer, int offset, int length) throws IOException {
                return super.read(buffer, offset, Math.min(1, length));
            }
        }) {
            assertTrue(SseFrameReader.read(stream, (event, data) -> frames.add(event + ":" + data)));
        }
        assertEquals(List.of("delta:{\"text\":\n\"你好\"}"), frames);
    }

    @Test
    void rejectsOversizedLineAndPreservesEofSemantics() throws Exception {
        assertThrows(
                DomainException.class,
                () -> SseFrameReader.read(new ByteArrayInputStream(new byte[1024 * 1024 + 1]), (event, data) -> {}));
        List<String> frames = new ArrayList<>();
        assertFalse(SseFrameReader.read(
                new ByteArrayInputStream("data: partial".getBytes(StandardCharsets.UTF_8)),
                (event, data) -> frames.add(data)));
        assertEquals(List.of("partial"), frames);
    }
}
