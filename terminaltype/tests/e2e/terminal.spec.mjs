import { test, expect } from "@playwright/test"

async function type(page, text) {
  await page.keyboard.type(text)
  await page.keyboard.press("Enter")
  await page.waitForTimeout(250)
}

test.describe("TerminalType", () => {
  test("boot → next → first lesson exercises → badge → progress persists", async ({ page }) => {
    await page.goto("http://localhost:3000")
    // boot sequence should appear
    await expect(page.getByText(/TerminalType BIOS/)).toBeVisible()
    // boot finishes → welcome + lesson card
    await expect(page.getByText(/First Steps/i)).toBeVisible({ timeout: 15000 })

    // start lesson 1
    await type(page, "next")
    await expect(page.getByText(/TASK \[/)).toBeVisible()

    // ex1: pwd
    await type(page, "pwd")
    await expect(page.getByText(/correct \(\+10 xp\)/)).toBeVisible()

    // ex2: ls
    await type(page, "ls")
    await expect(page.getByText(/correct \(\+10 xp\)/).nth(1)).toBeVisible()

    // ex3: cat welcome.txt
    await type(page, "cat welcome.txt")
    await expect(page.getByText(/BADGE UNLOCKED/)).toBeVisible()
    await expect(page.getByText(/first-command/i)).toBeVisible()

    // next lesson card should auto-load
    await expect(page.getByText(/Listing files like a pro/)).toBeVisible()

    // progress persisted to localStorage
    const raw = await page.evaluate(() => localStorage.getItem("terminaltype.progress.v1"))
    expect(raw).toBeTruthy()
    const progress = JSON.parse(raw)
    expect(progress.xp).toBeGreaterThan(0)
    expect(progress.completedLessons).toContain("t1-l1")
    expect(progress.badges).toContain("first-command")
  })

  test("typo coaching: pdw suggests pwd", async ({ page }) => {
    await page.goto("http://localhost:3000")
    await expect(page.getByText(/First Steps/i)).toBeVisible({ timeout: 15000 })
    await type(page, "next")
    await type(page, "pdw")
    await expect(page.getByText(/did you mean 'pwd'\?/)).toBeVisible()
  })

  test("hint command works in lessons", async ({ page }) => {
    await page.goto("http://localhost:3000")
    await expect(page.getByText(/First Steps/i)).toBeVisible({ timeout: 15000 })
    await type(page, "next")
    await type(page, "hint")
    await expect(page.getByText(/💡/)).toBeVisible()
  })

  test("help lists commands; theme switch works", async ({ page }) => {
    await page.goto("http://localhost:3000")
    await expect(page.getByText(/First Steps/i)).toBeVisible({ timeout: 15000 })
    await type(page, "help")
    await expect(page.getByText(/TerminalType commands/)).toBeVisible()
    await type(page, "theme dracula")
    await expect(page.getByText(/theme set to dracula/)).toBeVisible()
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".terminal-root")).backgroundColor)
    expect(bg).toBe("rgb(40, 42, 54)")
  })

  test("Ctrl+K palette jumps to lessons", async ({ page }) => {
    await page.goto("http://localhost:3000")
    await expect(page.getByText(/First Steps/i)).toBeVisible({ timeout: 15000 })
    await page.keyboard.press("Control+k")
    await expect(page.getByPlaceholder(/jump to lesson/)).toBeVisible()
    await page.keyboard.type("docker")
    await page.keyboard.press("Enter")
    await page.waitForTimeout(300)
    await expect(page.getByText(/boxes for your code/)).toBeVisible()
  })

  test("learn docker jumps to the docker track", async ({ page }) => {
    await page.goto("http://localhost:3000")
    await expect(page.getByText(/First Steps/i)).toBeVisible({ timeout: 15000 })
    await type(page, "learn docker")
    await expect(page.getByText(/boxes for your code/i).first()).toBeVisible()
  })

  test("full git lesson walkthrough works", async ({ page }) => {
    await page.goto("http://localhost:3000")
    await expect(page.getByText(/First Steps/i)).toBeVisible({ timeout: 15000 })
    await type(page, "learn git")
    await type(page, "next") // start exercises
    await type(page, "git init")
    await expect(page.getByText(/correct \(\+10 xp\)/)).toBeVisible()
    await type(page, "git status")
    await expect(page.getByText(/correct \(\+10 xp\)/).nth(1)).toBeVisible()
    await expect(page.getByText(/git-born/i)).toBeVisible()
  })

  test("progress survives a page refresh", async ({ page }) => {
    await page.goto("http://localhost:3000")
    await expect(page.getByText(/First Steps/i)).toBeVisible({ timeout: 15000 })
    await type(page, "next")
    await type(page, "pwd")
    await expect(page.getByText(/correct \(\+10 xp\)/)).toBeVisible()
    await page.reload()
    await expect(page.getByText(/progress: 10 xp/)).toBeVisible({ timeout: 15000 })
  })

  test("save/export + reset work", async ({ page }) => {
    await page.goto("http://localhost:3000")
    await expect(page.getByText(/First Steps/i)).toBeVisible({ timeout: 15000 })
    await type(page, "save")
    await expect(page.getByText(/progress code/)).toBeVisible()
    await type(page, "reset")
    await expect(page.getByText(/progress wiped/)).toBeVisible()
    const raw = await page.evaluate(() => localStorage.getItem("terminaltype.progress.v1"))
    const xp = raw ? (JSON.parse(raw).xp ?? 0) : 0
    expect(xp).toBe(0)
  })
})
