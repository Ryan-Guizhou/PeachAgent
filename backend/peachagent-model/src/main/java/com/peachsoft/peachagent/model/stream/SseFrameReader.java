package com.peachsoft.peachagent.model.stream;

import com.peachsoft.peachagent.common.DomainException;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.function.BiConsumer;

/** 逐片段读取 SSE，立即交付完整事件，并限制单行与事件字节数。 */
public final class SseFrameReader {
    private static final int MAX_FRAME_BYTES = 1024 * 1024;

    private SseFrameReader() {
    }

    /** 支持 LF、CRLF、CR、跨片段 UTF-8 和多行 data；保留协议层的 EOF 判定。 */
    public static boolean read(InputStream input,BiConsumer<String,String> consumer) throws IOException {
        byte[] buffer = new byte[4096];
        Frame frame = new Frame(consumer);
        boolean skipLf = false;
        int count;
        while ((count = input.read(buffer)) != -1) {
            for (int index = 0; index < count; index++) {
                int value = buffer[index] & 0xff;
                if (skipLf) {
                    skipLf = false;
                    if (value == '\n') {
                        continue;
                    }
                }
                if (value == '\r' || value == '\n') {
                    if (frame.finishLine()) {
                        return true;
                    }
                    skipLf = value == '\r';
                } else {
                    frame.append(value);
                }
            }
        }
        return frame.finishLine() || frame.dispatch();
    }

    private static final class Frame {
        private final ByteArrayOutputStream line = new ByteArrayOutputStream(256);
        private final StringBuilder data = new StringBuilder();
        private final BiConsumer<String,String> consumer;
        private String event = "";
        private int dataBytes;
        private boolean firstLine = true;
        private boolean hasData;

        private Frame(BiConsumer<String,String> consumer) {
            this.consumer = consumer;
        }

        private void append(int value) {
            if (line.size() >= MAX_FRAME_BYTES) {
                throw invalid();
            }
            line.write(value);
        }

        private boolean finishLine() {
            int length = line.size();
            String value = line.toString(StandardCharsets.UTF_8);
            line.reset();
            if (firstLine) {
                firstLine = false;
                if (value.startsWith("\uFEFF")) {
                    value = value.substring(1);
                }
            }
            if (value.isEmpty()) {
                return dispatch();
            }
            if (value.startsWith("event:")) {
                event = value.substring(6).strip();
            } else if (value.startsWith("data:")) {
                dataBytes += length + 1;
                if (dataBytes > MAX_FRAME_BYTES) {
                    throw invalid();
                }
                if (hasData) {
                    data.append('\n');
                }
                data.append(value.substring(5).stripLeading());
                hasData = true;
            }
            return false;
        }

        private boolean dispatch() {
            if (hasData) {
                String value = data.toString();
                if ("[DONE]".equals(value)) {
                    return true;
                }
                consumer.accept(event,value);
            }
            data.setLength(0);
            dataBytes = 0;
            hasData = false;
            event = "";
            return false;
        }
    }

    private static DomainException invalid() {
        return new DomainException("MODEL_RESPONSE_INVALID",502,"Model SSE frame exceeds limit");
    }
}
