# Injection (Command / NoSQL / Template / LDAP)

**Impact: CRITICAL** | **Category: security** | **OWASP: A03** | **Tags:** injection, rce, nosql, template

Beyond SQL and XSS: any interpreter that receives unvalidated input can be injected — OS commands,
NoSQL query objects, template engines (SSTI), and LDAP filters. Never build these from raw input.

## Why this matters
`os.system(f"convert {name}")` with `name="; rm -rf /"` is remote code execution. NoSQL operators
(`{"$gt": ""}`) can bypass auth. Server-side template injection can reach RCE.

## ❌ Incorrect
```python
os.system(f"convert {user_file} out.png")                 # command injection
db.users.find({"user": req.body.user})                    # NoSQL operator injection
render_template_string("Hi " + user_name)                 # SSTI
```

## ✅ Correct
```python
subprocess.run(["convert", user_file, "out.png"], check=True)   # arg list, no shell
db.users.find({"user": {"$eq": str(req.body.user)}})            # coerce + explicit operator
render_template("hi.html", name=user_name)                       # fixed template, escaped var
```

## Checklist
- [ ] No shell string building; use argument lists and `shell=False`.
- [ ] NoSQL inputs are type-coerced; reject objects where a scalar is expected.
- [ ] No user input in template source; pass as escaped variables only.
- [ ] Allow-list values where the set is known (filenames, formats, sort fields).
