const puppeteer = require('puppeteer');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, "./settings/.env") });

const setting = {
    loyola_id: process.env.LOYOLA_ID,
    loyola_password: process.env.LOYOLA_PASSWORD,
    loyola_uri: process.env.LOYOLA_URI,
    discord_webhook_url: process.env.DISCORD_WEBHOOK_URL,
};

const datetime_log_filepath = "./settings/previous_update_time.txt";

const loyola_xpath = {
    login_username: '//input[@name="userName"]',
    login_password: '//input[@name="password"]',
    login_button: '//input[@value="ログイン"]',
    link_from_home_to_board_menu: '//div[@id="tab-kj"]', //ホーム画面ヘッダーの掲示板アイコン
    link_from_home_to_board: '//*[@id="tabmenu-ul"]/li[1]/span', //掲示板アイコンをクリックした先から掲示板本体へ飛ぶリンク
    link_from_main_board_to_univ_bulletin_board: '/html/body/table[3]/tbody/tr[7]/td[1]/a', //掲示板ホームから大学掲示板へのリンク
    club_info_update_times: '//*[@id="keijiSearchForm"]/table[4]/tbody/tr/td[4]', //課外活動の掲示の更新日時（すべて）
    club_info_update_time_latest: '//*[@id="keijiSearchForm"]/table[4]/tbody/tr[1]/td[4]', //課外活動の掲示の更新日時（最新のみ）
    club_info_latest_link: '//*[@id="keijiSearchForm"]/table[4]/tbody/tr[1]/td[1]/p[2]/a', //課外活動の掲示へのリンク（最新のみ）
    notice_title: "//span[@class='keiji-title']", //掲示タイトル
    notice_description: "//div[@class='keiji-naiyo']", //掲示内容
    notice_time: "//table[2]/tbody/tr[2]/td", //掲載日時
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

const post_webhook = async (webhook_url, [notice_title = "掲示タイトル", notice_description = "掲示内容", notice_time = "更新時刻"], attached_file_flag) => {
    try {
        const file_texts = (attached_file_flag == false) ? "添付ファイルは存在しないようです" : "添付ファイルがあるようです。掲示板を開いてダウンロードしてください";
        const webhook_body = { //Webhookに送信するデータ本体
            "username": 'LOYOLA更新情報',
            "avatar_url": 'https://raw.githubusercontent.com/stepney141/loyola-scraper/master/avatar.jpg',
            "content": `LOYOLAに新しい課外活動情報が掲示されました！\n${file_texts}`,
            "embeds": [{
                "title": notice_title,
                "description": notice_description,
                "footer": {
                    "text": notice_time
                }
            }]
        };
        const response = await fetch(webhook_url,
            {
                method: 'POST',
                headers: { //ヘッダ
                    // 'Accept': 'application/json',
                    'Content-type': 'application/json',
                },
                body: JSON.stringify(webhook_body)
            }
        );
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText} ${await response.text()}`);
        }
        // console.log(await response.json());
    } catch (e) {
        console.log(e);
        return false;
    }
    console.log('webhook送信完了');
    return true;
};

const loyola_scraper = async (browser) => {
    try {
        const page = await browser.newPage();
        await page.evaluateOnNewDocument(() => { //webdriver.navigatorを消して自動操縦であることを隠す
            Object.defineProperty(navigator, 'webdriver', ()=>{});
            delete navigator.__proto__.webdriver;
        });

        await page.goto(setting.loyola_uri, { //LOYOLAトップページに飛ぶ
            timeout: 180000,
            waitUntil: 'domcontentloaded',
        });

        const userNameInputHandle = page.$x(loyola_xpath.login_username);
        const passwordInputHandle = page.$x(loyola_xpath.login_password);
        const loginButtonHandle = page.$x(loyola_xpath.login_button);

        await (await userNameInputHandle)[0].type(setting.loyola_id); //学籍番号入力
        await (await passwordInputHandle)[0].type(setting.loyola_password); //パスワード入力
        
        await Promise.all([
            page.waitForNavigation({ //画面遷移待ち
                timeout: 180000,
                waitUntil: 'domcontentloaded',
            }),
            (await loginButtonHandle)[0].click() //ログインボタンを押す
        ]);

        console.log('Loyolaログイン完了');

        /*
        target="_blank"で開いた新規タブへの切り替え
        ref:
        https://github.com/puppeteer/puppeteer/issues/3718#issuecomment-451325093
        https://scrapbox.io/hiroxto/Puppeteer%E3%81%A7target=%22_blank%22%E3%81%8C%E9%96%8B%E3%81%8F%E3%81%AE%E3%82%92%E5%BE%85%E3%81%A4
        */
        await mouse_click(600, 100, page); //掲示板メニューを開く
        const [newPage] = await Promise.all([
            new Promise(resolve => page.once('popup', resolve)),
            mouse_click(50, 140, page) //リンクをクリックして掲示板本体へ飛ぶ（新規タブが開く）
        ]);

        await newPage.evaluateOnNewDocument(() => { //webdriver.navigatorを消して自動操縦であることを隠す
            Object.defineProperty(navigator, 'webdriver', ()=>{});
            delete navigator.__proto__.webdriver;
        });
        await newPage.waitForSelector("body"); //新規タブの画面遷移待ち

        console.log('掲示板の走査を開始します');

        mouse_click(40, 380, newPage), //詳細検索
        await newPage.waitForNavigation({ 
            waitUntil: 'domcontentloaded',
            timeout: 180000
        });

        await newPage.select('select#category1', '12'); //カテゴリ1の「学生生活」を選択
        await newPage.waitForTimeout(5000);
        await newPage.select('select#category2', '16'); //カテゴリ2の「課外活動」を選択
        await newPage.waitForTimeout(2000);
        await Promise.all([
            newPage.waitForNavigation({ timeout: 180000 }), //画面遷移待ち
            mouse_click(25, 230, newPage) //検索ボタンを押す
        ]);

        /* ここから大学掲示板の課外活動掲示一覧での操作に突入 */

        const prev_info_datetime = await fs.readFile(datetime_log_filepath, "utf-8"); //最後に取得した課外活動掲示の時刻情報を環境変数から読み込む
        
        const clubInfoLatestTimeHandle = await newPage.$x(loyola_xpath.club_info_update_time_latest);
        const latest_info_datetime = await (await clubInfoLatestTimeHandle[0].getProperty("innerText")).jsonValue();

        if (Date.parse(latest_info_datetime) !== Date.parse(prev_info_datetime)) {
            //前回に掲示板を確認した時より後に、新しく掲示が出てた時の処理

            console.log('新しい課外活動掲示が見つかりました');

            //最後に取得した課外活動掲示の時刻情報をファイルへ書き出す
            await fs.writeFile(
                datetime_log_filepath,
                latest_info_datetime,
                (e) => {
                    if (e) console.log("error: ", e);
                }
            );

            const linkToLatestClubInfo_Handle = await newPage.$x(loyola_xpath.club_info_latest_link);
            await Promise.all([
                newPage.waitForNavigation(), //画面遷移を待ち受ける
                linkToLatestClubInfo_Handle[0].click(), //最新の課外活動掲示へのリンクをクリック
            ]);

            const attachedFile_Handle = await newPage.$x(loyola_xpath.notice_files);
            const attached_file_exists = (await attachedFile_Handle[0] == undefined) ? false : true; //添付ファイルが存在するか否かのフラグ

            const noticeTitle_Handle = newPage.$x(loyola_xpath.notice_title);
            const noticeDescription_Handle = newPage.$x(loyola_xpath.notice_description);
            const noticeTime_Handle = newPage.$x(loyola_xpath.notice_time);

            const notice_info = [
                await (await (await noticeTitle_Handle)[0].getProperty("innerText")).jsonValue(), //掲示タイトル
                await (await (await noticeDescription_Handle)[0].getProperty("innerText")).jsonValue(), //掲示内容
                await (await (await noticeTime_Handle)[0].getProperty("innerText")).jsonValue() //更新時刻
            ];

            await post_webhook(setting.discord_webhook_url, notice_info, attached_file_exists); //webhook送信
            // console.log(notice_info);

        } else {
            //更新が来てなかったら何もしない
            console.log('新しい課外活動掲示が見つかりませんでした');
        }

        /* LOYOLAからログアウト */
        await page.bringToFront(); //タブ切り替え
        await mouse_click(700, 20, page); //メニューバーの"ログアウト"を押す
        await page.waitForTimeout(3000);
        await mouse_click(400, 410, page); //"ログアウトしました"で"OK"ボタンを押す
        console.log('Loyolaログアウト完了');

    } catch (e) {
        console.log(e);
        return false;
    }
    return true; 
};

(async () => {
    const browser = await puppeteer.launch({
        defaultViewport: { width: 1000, height: 1000 },
        args: [
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-first-run',
            '--no-sandbox',
            '--no-zygote',
            // '--single-process'
        ],
        headless: true,
        // headless: false,
        slowMo: 100
    });

    await loyola_scraper(browser);

    await browser.close();
})();
