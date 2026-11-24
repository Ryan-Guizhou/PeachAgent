package com.peachsoft.peachagent.model;

import com.peachsoft.peachagent.common.DomainException;
import java.io.Closeable;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

/** 取消同时关闭正在读取的响应流；事件消费端由 Runtime 实现。 */
public final class ModelExecutionContext {
    private final ControlledTransport.Session transport;
    private final Consumer<String> delta;
    private final AtomicBoolean cancelled=new AtomicBoolean();
    private final AtomicReference<Closeable> resource=new AtomicReference<>();

    public ModelExecutionContext(ControlledTransport.Session transport,Consumer<String> delta) {
        this.transport=transport;this.delta=delta;
    }
    public ControlledTransport.Session transport() {return transport;}
    public void emit(String text) {checkActive();if(text!=null&&!text.isEmpty())delta.accept(text);}
    public void attach(Closeable closeable) {
        resource.set(closeable);
        if(cancelled.get()){close(closeable);checkActive();}
    }
    public void detach(Closeable closeable){resource.compareAndSet(closeable,null);}
    public void cancel(){cancelled.set(true);close(resource.getAndSet(null));}
    public void checkActive(){if(cancelled.get()||Thread.currentThread().isInterrupted())throw new DomainException("RUN_CANCELLED",409,"Execution cancelled");}
    private static void close(Closeable value){if(value!=null)try{value.close();}catch(IOException ignored){/* 取消尽力释放，调用事实由 Runtime 结算。 */}}
}
