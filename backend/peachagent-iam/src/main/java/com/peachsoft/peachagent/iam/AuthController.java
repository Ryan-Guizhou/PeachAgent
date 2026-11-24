package com.peachsoft.peachagent.iam;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
@Profile("api")
public class AuthController {
    private final AccountService account;
    private final IdentityService identity;
    public AuthController(AccountService account,IdentityService identity) {this.account=account;this.identity=identity;}

    @PostMapping("/email-challenges")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String,String> challenge(@RequestBody AccountService.Challenge input,HttpServletRequest request) {
        account.challenge(input,request.getRemoteAddr());
        return Map.of("status","ACCEPTED");
    }
    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public void register(@RequestBody AccountService.Register input,HttpServletRequest request) {account.register(input,request.getRemoteAddr());}
    @PostMapping("/login")
    public Map<String,Object> login(@RequestBody AccountService.Login input,HttpServletRequest request) {return account.login(input,request.getRemoteAddr());}
    @PostMapping("/password-reset")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reset(@RequestBody AccountService.Reset input,HttpServletRequest request) {account.reset(input,request.getRemoteAddr());}
    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout() {account.logout();}
    @GetMapping("/me")
    public Map<String,Object> me() {return identity.sessionView(identity.current());}
    @PatchMapping("/preferences")
    public Map<String,Object> preferences(@RequestBody AccountService.Preferences input) {return account.preferences(input);}
}
