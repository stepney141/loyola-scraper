const puppeteer = require('puppeteer');
const axios = require('axios');
const fs = require('fs');
const setting = require('./setting.json');

const loyola_xpath = {
    login_username: '//input[@name="userName"]',
    login_password: '//input[@name="password"]',
    login_button: '//input[@value="ログイン"]',
    link_from_home_to_board_menu: '//div[@id="tab-kj"]', //ホーム画面ヘッダーの掲示板アイコン
    link_from_home_to_board: '//*[@id="tabmenu-ul"]/li[1]/span', //掲示板アイコンをクリックした先から掲示板本体へ飛ぶリンク
    link_from_main_board_to_univ_bulletin_board: '/html/body/table[3]/tbody/tr[7]/td[1]/a', //掲示板ホームから大学掲示板へのリンク
    club_info_links: "//td[contains(*, '課外活動')]/p[2]/a", //大学掲示板の中にある課外活動情報へのリンク
    club_info_update_times: '//*[@id="keijiSearchForm"]/table[4]/tbody/tr/td[4]', //課外活動の情報の更新日時（すべて）
    club_info_update_time_latest: '//*[@id="keijiSearchForm"]/table[4]/tbody/tr[1]/td[4]', //課外活動の情報の更新日時（最新のみ）
    notice_title: "//span[@class='keiji-title']", //掲示タイトル
    notice_description: "//div[@class='keiji-naiyo']", //掲示内容
    notice_date: "//table[2]/tbody/tr[2]/td", //掲載日時
    notice_files: "//table[3]/tbody/tr/td/a", //すべての添付ファイルへのリンク群
};

const mouse_click = async (x, y, page) => {
    try {
        await Promise.all([
            page.mouse.move(x, y),
            page.waitForTimeout(1000),
            page.mouse.click(x, y),
        ]);
        return true;
    } catch (e) {
        const error_m = 'mouse_click_error:';
        console.error(error_m + e);
        return false;
    }
};

const fetch_file = async (x, y, page) => {
    try {
        let status_code = 0;
        await page._client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: setting.download_path
        });
        page.on('response', response => {
            status_code = response.status(); // HTTPステータスコードを取得する
        });
        await mouse_click(x, y, page);
        await page.waitForTimeout(1000);
        if (status_code == 500) {
            throw new Error('[status_code:500] ダウンロードできません');
        }
    } catch (e) {
        console.error(e);
        return false;
    }
    
    const filename = await ((async () => {
        let filename;
        while (!filename || filename.endsWith('.crdownload')) {
            filename = fs.readdirSync(setting.download_path)[0];
        }
        return filename;
    })());

    return true;
};

const post_webhook = async (webhook_url) => {
    try {
        const config = { //ヘッダーなどの設定
            headers: {
                'Content-type': 'multipart/form-data',
            }
        };
        const post_data = { //送信するデータ
            username: 'LOYOLA更新情報',
            avatar_url: 'https://static.selelab.com/favicon.ico',
            content: `LOYOLAに新しい課外活動情報が掲示されました！`
        };

        const response = await axios.post(webhook_url, post_data, config);
        console.log(response);
    } catch (e) {
        console.log(e);
    }
};

const loyola_scraper = async (browser) => {
    try {
        const page = await browser.newPage();
        await page.evaluateOnNewDocument(() => { //webdriver.navigatorを消して自動操縦であることを隠す
            Object.defineProperty(navigator, 'webdriver', ()=>{});
            delete navigator.__proto__.webdriver;
        });

        await page.goto(setting.loyola_uri, {
            waitUntil: "networkidle0",
        });

        const userNameInputHandle = page.$x(loyola_xpath.login_username);
        const passwordInputHandle = page.$x(loyola_xpath.login_password);
        const loginButtonHandle = page.$x(loyola_xpath.login_button);

        await (await userNameInputHandle)[0].type(setting.loyola_id); //学籍番号入力
        await (await passwordInputHandle)[0].type(setting.loyola_password); //パスワード入力
        await (await loginButtonHandle)[0].click(); //ログインボタンを押す
        
        await page.waitForNavigation({ //画面遷移待ち
            timeout: 60000,
            waitUntil: "networkidle0",
        });

        await mouse_click(600, 100, page); //掲示板メニューを開く

        await mouse_click(50, 140, page); //掲示板本体へ飛ぶ（新規タブが開く）

        /*
        target="_blank"で開いた新規タブへの切り替え
        ref: https://github.com/puppeteer/puppeteer/issues/3718#issuecomment-451325093
        */
        const pageTarget = page.target(); //新規タブのopenerを保存
        const newTarget = await browser.waitForTarget(target => target.opener() === pageTarget); //新規タブが開いたか確認
        const newPage = await newTarget.page(); //新規タブの情報を保存
        await newPage.evaluateOnNewDocument(() => { //webdriver.navigatorを消して自動操縦であることを隠す
            Object.defineProperty(navigator, 'webdriver', ()=>{});
            delete navigator.__proto__.webdriver;
        });
        await newPage.waitForSelector("body"); //新規タブの画面遷移待ち

        await mouse_click(40, 380, newPage); //詳細検索
        await newPage.select('select#category1', '12'); //カテゴリ1の「学生生活」を選択
        await newPage.select('select#category2', '16'); //カテゴリ2の「課外活動」を選択
        await mouse_click(25, 230, newPage); //検索ボタンを押す
        await newPage.waitForTimeout(2000);//画面遷移待ち

        /* ここから大学掲示板の課外活動掲示一覧での操作に突入 */
        const prev_info_date = fs.readFileSync(setting.date_temp_file_path, 'utf-8'); //最後に取得した課外活動掲示の情報を取得
        console.log(prev_info_date);

        const clubInfoTimesHandle = await newPage.$x(loyola_xpath.club_info_update_times);
        for (const data of clubInfoTimesHandle) {
            console.log(
                await (await data.getProperty("innerText")).jsonValue()
            );
        }

        const clubInfoLatestTimeHandle = await newPage.$x(loyola_xpath.club_info_update_time_latest);
        const latest_info_date = await (await clubInfoLatestTimeHandle[0].getProperty("innerText")).jsonValue();
        await fs.writeFile(setting.date_temp_file_path, latest_info_date, (e) => {
            if (e) throw new Error('file writing failed:' + e);
        }); //最後に取得した課外活動掲示の情報を上書き

        /* LOYOLAからログアウト */
        await mouse_click(700, 20, page); //メニューバーの"ログアウト"を押す
        await mouse_click(400, 410, page); //"ログアウトしました"で"OK"ボタンを押す
        console.log('logout: successed');

    } catch (e) {
        console.log(e);
        return false;
    }
    return true; 
};

(async () => {
    const browser = await puppeteer.launch({
        defaultViewport: { width: 1000, height: 1000 },
        headless: true,
        // headless: false,
        slowMo: 100
    });

    await loyola_scraper(browser);

    await browser.close();
})();