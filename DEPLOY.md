# Implantação na VM (Ubuntu Server 26.04)

## 1. Requisitos da VM

**2 GB de RAM e 2 núcleos são suficientes** para uso interno da equipe de TI.

| Componente | Consumo aproximado |
|---|---|
| Ubuntu Server (sem interface gráfica) | 300–400 MB |
| Docker | ~100 MB |
| TermoCBA (Node + Chromium aberto gerando PDF) | ~160–300 MB |
| TermoCBA ocioso (Chromium fecha após 5 min sem uso) | ~60 MB |

Disco: reserve pelo menos **10 GB livres**. A imagem tem cerca de 1 GB e cada termo ocupa ~100 KB no banco.
O build da imagem é o momento de maior uso de RAM. Se a VM não tiver swap, crie 2 GB por segurança:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. Instalar o Docker na VM

```bash
sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

Saia e entre de novo na sessão SSH para o grupo `docker` valer. Teste com `docker compose version`.

> Se o pacote `docker-compose-v2` não existir, instale pelo script oficial: `curl -fsSL https://get.docker.com | sudo sh`

## 3. Baixar o projeto do GitHub na VM

```bash
cd ~
git clone https://github.com/SEU_USUARIO/termocba.git Projeto_TermoCBA
cd Projeto_TermoCBA
```

Se o repositório for **privado**, o git pede usuário e senha. No campo senha, use um **token** do GitHub (Settings → Developer settings → Personal access tokens → Fine-grained, com permissão de leitura em *Contents* só nesse repositório). Para não precisar digitar de novo: `git config --global credential.helper store`.

## 4. Definir a senha e subir

```bash
cp .env.example .env
nano .env          # defina ADMIN_USER, ADMIN_PASS e PORTA
docker compose up --build -d
docker compose logs -f      # deve mostrar "TermoCBA rodando em http://localhost:3000"
```

O `.env` fica só na VM e não vai para o GitHub. O `restart: unless-stopped` faz o sistema voltar sozinho quando a VM reiniciar.

## 5. Acessar de outros computadores

Descubra o IP da VM:

```bash
hostname -I
```

Nos outros computadores da rede, abra **http://IP_DA_VM:3000**.

Se o firewall da VM estiver ativo (`sudo ufw status`), libere a porta:

```bash
sudo ufw allow 3000/tcp
```

Para acessar sem o `:3000`, coloque `PORTA=80` no `.env`, rode `docker compose up -d` e libere a porta 80 no ufw.

Se não abrir de outra máquina, confira se a placa de rede da VM está em modo **bridge**. Em modo NAT, a VM não fica visível na rede.

## 6. Backup

```bash
./scripts/backup.sh
```

O script gera uma cópia consistente em `data/backups/` e mantém as 30 mais recentes. Para rodar todo dia às 2h, use `crontab -e`:

```
0 2 * * * /home/USUARIO/Projeto_TermoCBA/scripts/backup.sh >> /home/USUARIO/termocba-backup.log 2>&1
```

Copie os backups para fora da VM (outro servidor ou compartilhamento de rede). Um backup que fica só na VM se perde junto com ela.

**Restaurar:** `docker compose down`, depois substitua `data/termocba.sqlite` pelo backup escolhido (`sudo cp`) e rode `docker compose up -d`.

## 7. Atualizar o sistema

Depois de enviar as mudanças para o GitHub, rode na VM:

```bash
cd ~/Projeto_TermoCBA
git pull
docker compose up --build -d
docker image prune -f
```

O banco (`data/`) e o `.env` não fazem parte do git, então a atualização não mexe neles.

## Comandos úteis

| Ação | Comando |
|---|---|
| Ver status | `docker compose ps` |
| Ver logs | `docker compose logs -f --tail 100` |
| Reiniciar | `docker compose restart` |
| Parar | `docker compose down` |
| Uso de memória | `docker stats --no-stream` |
