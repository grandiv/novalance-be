PO = Project Owner
FL = Freelancer
FD = Further Development
AV = Developer web3 kita

Flow duit PO

1. User masuk platform
2. Dia connect wallet
3. Di wallet harus beli IDRX
4. Duit di platform kita cek dari amount IDRX
5. Misal dia bikin project, dia bikin dari 3 KPI. dia depo KPI pertama 20jt dengan timeline 2 bulan
6. 20jt itu masuk ke vault novalance
7. Smart contract misah 10% (2 juta) untuk disalurin ke LP (Nusa Finance)
8. 2juta IDRX bakal flow -> ???? (dari IDRX masuk nusa masuk Layerzero..)
9. Smart contract tiap kali ada duit masuk dia bisa trigger filter misal parameter 5%<APY,
10. Setelah 2 bulan itukan KPI antara PO dan FL itu acc untuk turun,
    a. misal jadi 2.2jt. Itu 200k profit bagi 3 40% PO, 40% FL, dan 20% AV
    i. PO = 80k
    ii. FL = 2.080.000
    iii. AV = 40k
    b. misal rugi 1.8jt ditanggung PO 50% n FL 50%
11. Platform ga transfer ke wallet PO / FL, kita cuman kasih algoritma split dan kasih tau munculin di FE withdrawalble amount

Main Flow User:

1. PO bikin job: masukin data kebutuhan job, spesifikasi, timeline, requirement.
2. PO bisa mecah job dalam 1 project (misal ada 2 dev, FE dan BE)
3. PO deposit duit sesuai termin KPI
4. Freelancer Apply dengan informasi Profile github, linkedin, past project di platform
5. PO bisa milih freelancer dari apply an
6. Setelah PO milih, deal berjalan dan untuk sekarang termin sesederhana acc 2 pihak (FD: nanti kalo mau ngepull ke repo harus bayar pake x402)
7. KPI terpenuhi maka FL turun duit inti dan bonus/potongan LP.

Additional flow

1. How PO set dan nambah deposit untuk KPI selanjutnya
2. Onchain portofolio PO dan FL dari history tiap kali withdraw (ponder) FD

Wait, for your context, do we need to adjust BE job (me)? here's the SC developer job:

- Mock IDRX
- Vault
  -- 90:10 split
  -- LP Integration
  -- Fixed Milestone steps & checkpoint termin deadline & distribution
- Freelance Request Withdrawal
  -- Multi-sig Freelancer + Project Owner
  -- Yield distribution (+/- 40% to FL, 40% to PO, 20% to DW3)
  -- Termin count, price distribution set by PO
  -- Kalau rugi => project berhasil = 100% freelancer, project cancel = 100% PO
- Submission (DW3)
  -- Dev Late: Penalty set by Project Owner (-% / day) until 0
  -- PO Late response: X days late auto allow withdraw in termin
- Cancel project (10% LP + 90% vault)
  -- 90% refund from Vault
  -- 10% LP whatever happens goes to us
  -- Cancel after termin, yg udh termin masuk dev, sisanya bisa ditarik (10% locked udah di kita)

Here's the FE job:

- Flow PO
  -- Login n Wallet connect
  -- Post jobs
  --- Set Job Desc
  --- Set Timeline
  --- Set Termin
  --- Select FL
  -- Monitor progress
  --- Cek progress
  --- ACC/Cancel KPI
  -- Profile
  --- Update Offchain data
  --- Shown onchain data
- Flow FL
  -- Login n Wallet connect
  -- Apply job
  --- Search job
  --- Check requirement and apply
  -- Profile
  --- Update Offchain data
  --- Shown onchain data

curl -X POST http://localhost:3000/api/auth/wallet/nonce -H "Content-Type: application/json" -d "{\"address\":\"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\"}"

Invoke-WebRequest -Uri "http://localhost:3000/api/auth/wallet/nonce" -Method POST -Headers @{"Content-Type"="application/json"} -Body '{"address":"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"}'

curl.exe -X POST http://localhost:3000/api/auth/wallet/nonce -H "Content-Type: application/json" -d "{\"address\":\"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb\"}"
